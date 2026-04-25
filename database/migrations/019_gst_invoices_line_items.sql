-- =============================================================================
-- 019_gst_invoices_line_items.sql
-- Phase 6B — GST Completion
--
-- Adds invoice-level line-item support for GSTR-1 invoice-level submission.
--
-- NOTE on naming:
--   The legacy table `gst.gst_invoice` (from 004_gst_schema.sql) already exists
--   for B2B/B2C/Credit/Debit/Export invoice headers. This migration ADDS:
--     - `gst.invoices`            (new — Phase 6B-aligned naming, additive)
--     - `gst.invoice_line_items`  (new — line-level taxable_value/CGST/SGST/IGST/CESS)
--   The legacy `gst.gst_invoice` is kept untouched (additive principle).
--   Backend will treat `gst.invoices` as the canonical Phase-6B-onwards table;
--   migration of legacy rows is an ops task, NOT part of this schema migration.
--
-- RLS: org_id-scoped via auth.organization_member (consistent with 004_gst_schema.sql).
-- DPDP: customer_gstin and buyer_name are PII; included in DPDP erasure cascade
--       (org-level erasure soft-deletes rows via deleted_at, app-layer enforced).
-- Idempotent: uses IF NOT EXISTS / DO blocks throughout.
-- Depends on: 000_init.sql (shared.set_updated_at), 001_auth_schema.sql, 004_gst_schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- gst.invoices — invoice header (GSTR-1 aligned)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,                       -- auth.organization.id
    gst_return_id           UUID REFERENCES gst.gst_return (id),
    invoice_no              VARCHAR(100) NOT NULL,
    invoice_date            DATE NOT NULL,
    invoice_type            VARCHAR(30) NOT NULL DEFAULT 'B2B'
                                CHECK (invoice_type IN ('B2B','B2C','B2CL','CDNR','CDNUR','EXPORT','SEZ','DEEMED_EXPORT')),
    -- Supplier
    supplier_gstin          VARCHAR(15) NOT NULL
                                CHECK (supplier_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    supplier_legal_name     VARCHAR(500),
    -- Customer
    customer_gstin          VARCHAR(15)
                                CHECK (customer_gstin IS NULL OR customer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    customer_name           VARCHAR(500),
    customer_state_code     VARCHAR(2),
    -- Place of supply (state code 01-37)
    place_of_supply         VARCHAR(2) NOT NULL,
    is_reverse_charge       BOOLEAN NOT NULL DEFAULT FALSE,
    is_inter_state          BOOLEAN NOT NULL DEFAULT FALSE,
    -- Header totals (denormalized for fast list views; recomputed from line items)
    total_taxable_value     NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_cgst              NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_sgst              NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_igst              NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_cess              NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_invoice_value     NUMERIC(20,2) NOT NULL DEFAULT 0,
    currency                CHAR(3) NOT NULL DEFAULT 'INR',
    -- Source linkage
    source_document_id      UUID,                                -- document.document.id (uploaded PDF/scan)
    source_journal_entry_id UUID,                                -- accounting.journal_entry.id
    -- E-invoice linkage (FK to gst.e_invoice_irn_log added in 022)
    irn_log_id              UUID,
    -- E-Way Bill linkage (FK to gst.e_way_bills added in 022)
    e_way_bill_id           UUID,
    -- Workflow
    status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','VALIDATED','SUBMITTED','REJECTED','CANCELLED')),
    validation_errors       JSONB,
    submitted_at            TIMESTAMPTZ,
    submitted_by            UUID,
    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (org_id, invoice_no, invoice_date)
);

CREATE INDEX IF NOT EXISTS idx_gst_invoices_org_id            ON gst.invoices (org_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_return_id         ON gst.invoices (gst_return_id) WHERE gst_return_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gst_invoices_invoice_date      ON gst.invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_customer_gstin    ON gst.invoices (customer_gstin) WHERE customer_gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gst_invoices_status            ON gst.invoices (status, org_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_invoice_no        ON gst.invoices (org_id, invoice_no);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_place_of_supply   ON gst.invoices (place_of_supply);

ALTER TABLE gst.invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gst' AND tablename='invoices' AND policyname='gst_invoices_org_isolation') THEN
        CREATE POLICY gst_invoices_org_isolation ON gst.invoices
            USING (org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gst_invoices_updated_at') THEN
        CREATE TRIGGER trg_gst_invoices_updated_at
            BEFORE UPDATE ON gst.invoices
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- gst.invoice_line_items — line-level breakdown
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.invoice_line_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id              UUID NOT NULL REFERENCES gst.invoices (id) ON DELETE CASCADE,
    org_id                  UUID NOT NULL,                       -- denormalized for RLS
    line_no                 INTEGER NOT NULL,
    item_description         VARCHAR(1000) NOT NULL,
    -- HSN/SAC
    hsn_sac_code            VARCHAR(20) NOT NULL,
    hsn_sac_type            VARCHAR(10) NOT NULL DEFAULT 'HSN'
                                CHECK (hsn_sac_type IN ('HSN','SAC')),
    -- Quantity & rate
    quantity                NUMERIC(20,4) NOT NULL DEFAULT 1,
    unit                    VARCHAR(10),                          -- UQC code (NOS, KGS, etc.)
    rate                    NUMERIC(20,4) NOT NULL DEFAULT 0,     -- price per unit
    discount                NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Computed values
    taxable_value           NUMERIC(20,2) NOT NULL DEFAULT 0,
    gst_rate_pct            NUMERIC(5,2) NOT NULL DEFAULT 0,
    cgst_amount             NUMERIC(20,2) NOT NULL DEFAULT 0,
    sgst_amount             NUMERIC(20,2) NOT NULL DEFAULT 0,
    igst_amount             NUMERIC(20,2) NOT NULL DEFAULT 0,
    cess_amount             NUMERIC(20,2) NOT NULL DEFAULT 0,
    line_total              NUMERIC(20,2)
                                GENERATED ALWAYS AS
                                (taxable_value + cgst_amount + sgst_amount + igst_amount + cess_amount)
                                STORED,
    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (invoice_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_gst_invoice_lines_invoice_id ON gst.invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoice_lines_org_id    ON gst.invoice_line_items (org_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoice_lines_hsn        ON gst.invoice_line_items (hsn_sac_code);

ALTER TABLE gst.invoice_line_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gst' AND tablename='invoice_line_items' AND policyname='gst_invoice_line_items_org_isolation') THEN
        CREATE POLICY gst_invoice_line_items_org_isolation ON gst.invoice_line_items
            USING (org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gst_invoice_line_items_updated_at') THEN
        CREATE TRIGGER trg_gst_invoice_line_items_updated_at
            BEFORE UPDATE ON gst.invoice_line_items
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- =============================================================================
-- End of 019_gst_invoices_line_items.sql
-- =============================================================================
