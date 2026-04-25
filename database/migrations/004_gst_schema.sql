-- =============================================================================
-- 004_gst_schema.sql
-- GST Service — GSTR-1/3B/9, E-Invoicing, E-Way Bill, ITC, Reconciliation
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gst;

-- =============================================================================
-- gst.gst_tax_rate  (TEMPORAL TABLE — valid_from / valid_to)
-- GST tax rates are versioned as government policy changes them.
-- A rate is active when NOW() is between valid_from and valid_to.
-- =============================================================================
CREATE TABLE gst.gst_tax_rate (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_name       VARCHAR(100) NOT NULL,            -- e.g. 'GST 18%'
    rate_pct        NUMERIC(5,2) NOT NULL,            -- e.g. 18.00
    cgst_pct        NUMERIC(5,2) NOT NULL,            -- rate_pct / 2 for intra-state
    sgst_pct        NUMERIC(5,2) NOT NULL,            -- rate_pct / 2 for intra-state
    igst_pct        NUMERIC(5,2) NOT NULL,            -- rate_pct for inter-state
    cess_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
    valid_from      DATE NOT NULL,
    valid_to        DATE,                             -- NULL means currently active
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    CONSTRAINT chk_gst_tax_rate_valid_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX idx_gst_tax_rate_rate_pct ON gst.gst_tax_rate (rate_pct);
CREATE INDEX idx_gst_tax_rate_valid_from ON gst.gst_tax_rate (valid_from);
CREATE INDEX idx_gst_tax_rate_active ON gst.gst_tax_rate (is_active, valid_from, valid_to);

CREATE TRIGGER trg_gst_tax_rate_updated_at
    BEFORE UPDATE ON gst.gst_tax_rate
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.hsn_sac_code
-- HSN (Harmonized System of Nomenclature) and SAC (Service Accounting Codes)
-- =============================================================================
CREATE TABLE gst.hsn_sac_code (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(20) NOT NULL UNIQUE,
    code_type       VARCHAR(10) NOT NULL CHECK (code_type IN ('HSN','SAC')),
    description     VARCHAR(500) NOT NULL,
    gst_rate_pct    NUMERIC(5,2),                    -- Default GST rate for this code
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_hsn_sac_code_code ON gst.hsn_sac_code (code);
CREATE INDEX idx_hsn_sac_code_type ON gst.hsn_sac_code (code_type);
CREATE INDEX idx_hsn_sac_description ON gst.hsn_sac_code USING gin (description gin_trgm_ops);

CREATE TRIGGER trg_hsn_sac_code_updated_at
    BEFORE UPDATE ON gst.hsn_sac_code
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_return
-- Master record for each GST return filing (GSTR-1, GSTR-3B, GSTR-9, etc.)
-- =============================================================================
CREATE TABLE gst.gst_return (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    return_type         VARCHAR(20) NOT NULL
                            CHECK (return_type IN ('GSTR-1','GSTR-3B','GSTR-9','GSTR-2A','GSTR-2B')),
    financial_year      VARCHAR(10) NOT NULL,         -- e.g. '2024-25'
    period_month        SMALLINT,                     -- 1-12 (NULL for annual GSTR-9)
    period_quarter      SMALLINT,                     -- 1-4 (for quarterly filers)
    gstin               VARCHAR(15) NOT NULL,
    status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT','PENDING_APPROVAL','APPROVED',
                                'FILED','REVISION_NEEDED','AMENDED'
                            )),
    -- Computed amounts
    total_taxable_value NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_igst          NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_cgst          NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_sgst          NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_cess          NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_itc_available NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_tax_payable     NUMERIC(20,2) NOT NULL DEFAULT 0,
    late_fee_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
    interest_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Filing details
    filing_deadline     DATE,
    submitted_at        TIMESTAMPTZ,
    submitted_by        UUID,
    arn_number          VARCHAR(100),                 -- Acknowledgement Reference Number from GST portal
    filed_at            TIMESTAMPTZ,
    -- Approval workflow
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,
    rejection_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, return_type, financial_year, period_month)
);

CREATE INDEX idx_gst_return_org_id ON gst.gst_return (organization_id);
CREATE INDEX idx_gst_return_gstin ON gst.gst_return (gstin);
CREATE INDEX idx_gst_return_status ON gst.gst_return (status, organization_id);
CREATE INDEX idx_gst_return_type_fy ON gst.gst_return (return_type, financial_year);
CREATE INDEX idx_gst_return_deadline ON gst.gst_return (filing_deadline) WHERE status != 'FILED';

ALTER TABLE gst.gst_return ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gst_return_updated_at
    BEFORE UPDATE ON gst.gst_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_return_line_item
-- Individual line items within a GST return
-- =============================================================================
CREATE TABLE gst.gst_return_line_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gst_return_id   UUID NOT NULL REFERENCES gst.gst_return (id) ON DELETE CASCADE,
    line_type       VARCHAR(50) NOT NULL,             -- B2B, B2C, CDNR, EXEMPTED, etc.
    description     TEXT,
    hsn_sac_code    VARCHAR(20),
    taxable_value   NUMERIC(20,2) NOT NULL DEFAULT 0,
    igst_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
    cgst_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
    sgst_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
    cess_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
    gst_rate_pct    NUMERIC(5,2),
    invoice_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_gst_return_line_gst_return_id ON gst.gst_return_line_item (gst_return_id);
CREATE INDEX idx_gst_return_line_hsn ON gst.gst_return_line_item (hsn_sac_code) WHERE hsn_sac_code IS NOT NULL;

CREATE TRIGGER trg_gst_return_line_item_updated_at
    BEFORE UPDATE ON gst.gst_return_line_item
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_invoice
-- B2B/B2C GST-compliant invoices
-- =============================================================================
CREATE TABLE gst.gst_invoice (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    gst_return_id       UUID REFERENCES gst.gst_return (id),
    invoice_type        VARCHAR(30) NOT NULL
                            CHECK (invoice_type IN ('B2B','B2C','CREDIT_NOTE','DEBIT_NOTE','EXPORT')),
    invoice_number      VARCHAR(100) NOT NULL,
    invoice_date        DATE NOT NULL,
    -- Supplier
    supplier_gstin      VARCHAR(15) NOT NULL,
    supplier_name       VARCHAR(500) NOT NULL,
    -- Buyer
    buyer_gstin         VARCHAR(15),
    buyer_name          VARCHAR(500),
    buyer_state_code    VARCHAR(5),
    -- Amounts
    taxable_value       NUMERIC(20,2) NOT NULL DEFAULT 0,
    igst_amount         NUMERIC(20,2) NOT NULL DEFAULT 0,
    cgst_amount         NUMERIC(20,2) NOT NULL DEFAULT 0,
    sgst_amount         NUMERIC(20,2) NOT NULL DEFAULT 0,
    cess_amount         NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_invoice_value NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- E-invoicing
    irn_number          VARCHAR(100),                -- IRN from NIC portal
    irn_status          VARCHAR(30) CHECK (irn_status IN ('PENDING','GENERATED','CANCELLED')),
    irn_generated_at    TIMESTAMPTZ,
    qr_code_data        TEXT,                        -- QR code string for e-invoice
    -- Document link
    document_id         UUID,                        -- document.document.id
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gst_invoice_org_id ON gst.gst_invoice (organization_id);
CREATE INDEX idx_gst_invoice_return_id ON gst.gst_invoice (gst_return_id) WHERE gst_return_id IS NOT NULL;
CREATE INDEX idx_gst_invoice_number ON gst.gst_invoice (invoice_number, organization_id);
CREATE INDEX idx_gst_invoice_date ON gst.gst_invoice (invoice_date);
CREATE INDEX idx_gst_invoice_buyer_gstin ON gst.gst_invoice (buyer_gstin) WHERE buyer_gstin IS NOT NULL;
CREATE INDEX idx_gst_invoice_irn ON gst.gst_invoice (irn_number) WHERE irn_number IS NOT NULL;

ALTER TABLE gst.gst_invoice ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gst_invoice_updated_at
    BEFORE UPDATE ON gst.gst_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.itc_record
-- Input Tax Credit records
-- =============================================================================
CREATE TABLE gst.itc_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    gst_return_id       UUID REFERENCES gst.gst_return (id),
    invoice_id          UUID REFERENCES gst.gst_invoice (id),
    supplier_gstin      VARCHAR(15) NOT NULL,
    supplier_name       VARCHAR(500),
    invoice_number      VARCHAR(100) NOT NULL,
    invoice_date        DATE NOT NULL,
    igst_credit         NUMERIC(20,2) NOT NULL DEFAULT 0,
    cgst_credit         NUMERIC(20,2) NOT NULL DEFAULT 0,
    sgst_credit         NUMERIC(20,2) NOT NULL DEFAULT 0,
    cess_credit         NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_itc           NUMERIC(20,2)
                            GENERATED ALWAYS AS (igst_credit + cgst_credit + sgst_credit + cess_credit) STORED,
    is_eligible         BOOLEAN NOT NULL DEFAULT TRUE,
    ineligibility_reason TEXT,
    source              VARCHAR(30) NOT NULL DEFAULT 'GSTR_2B'
                            CHECK (source IN ('GSTR_2A','GSTR_2B','MANUAL')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_itc_record_org_id ON gst.itc_record (organization_id);
CREATE INDEX idx_itc_record_return_id ON gst.itc_record (gst_return_id) WHERE gst_return_id IS NOT NULL;
CREATE INDEX idx_itc_record_supplier ON gst.itc_record (supplier_gstin);
CREATE INDEX idx_itc_record_invoice_date ON gst.itc_record (invoice_date);

ALTER TABLE gst.itc_record ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itc_record_updated_at
    BEFORE UPDATE ON gst.itc_record
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.itc_mismatch
-- Mismatches between claimed ITC and GSTR-2A/2B data
-- =============================================================================
CREATE TABLE gst.itc_mismatch (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    itc_record_id       UUID REFERENCES gst.itc_record (id),
    mismatch_type       VARCHAR(50) NOT NULL
                            CHECK (mismatch_type IN (
                                'AMOUNT_MISMATCH','MISSING_IN_2B','EXCESS_CLAIM',
                                'DATE_MISMATCH','GSTIN_MISMATCH'
                            )),
    claimed_amount      NUMERIC(20,2) NOT NULL,
    available_amount    NUMERIC(20,2) NOT NULL,
    difference_amount   NUMERIC(20,2)
                            GENERATED ALWAYS AS (claimed_amount - available_amount) STORED,
    status              VARCHAR(50) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN','RESOLVED','IGNORED','ESCALATED')),
    resolution_notes    TEXT,
    resolved_at         TIMESTAMPTZ,
    resolved_by         UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_itc_mismatch_org_id ON gst.itc_mismatch (organization_id);
CREATE INDEX idx_itc_mismatch_itc_record_id ON gst.itc_mismatch (itc_record_id);
CREATE INDEX idx_itc_mismatch_status ON gst.itc_mismatch (status, organization_id);

ALTER TABLE gst.itc_mismatch ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itc_mismatch_updated_at
    BEFORE UPDATE ON gst.itc_mismatch
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_callback
-- Human-touch callback requests (9 trigger types from project brief)
-- =============================================================================
CREATE TABLE gst.gst_callback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    user_id             UUID NOT NULL,
    gst_return_id       UUID REFERENCES gst.gst_return (id),
    trigger_type        VARCHAR(100) NOT NULL
                            CHECK (trigger_type IN (
                                'MISSING_BILLS','RATE_MISMATCH','ITC_MISMATCH',
                                'INCOMPLETE_BILLING','FIRST_TIME','DISCREPANCY',
                                'GST_NOTICE','DEADLINE','USER_REQUESTED'
                            )),
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN (
                                'PENDING','ASSIGNED','IN_PROGRESS',
                                'COMPLETED','MISSED','CANCELLED'
                            )),
    assigned_to         UUID,                        -- Support executive user id
    priority            VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
                            CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    scheduled_at        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    duration_minutes    SMALLINT,
    fcr_achieved        BOOLEAN,                     -- First Call Resolution
    satisfaction_rating NUMERIC(3,2),                -- 1.00 – 5.00
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gst_callback_org_id ON gst.gst_callback (organization_id);
CREATE INDEX idx_gst_callback_user_id ON gst.gst_callback (user_id);
CREATE INDEX idx_gst_callback_status ON gst.gst_callback (status);
CREATE INDEX idx_gst_callback_assigned_to ON gst.gst_callback (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE gst.gst_callback ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gst_callback_updated_at
    BEFORE UPDATE ON gst.gst_callback
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_notice
-- GST notices received from the tax authority
-- =============================================================================
CREATE TABLE gst.gst_notice (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    notice_number       VARCHAR(100) NOT NULL,
    notice_type         VARCHAR(100) NOT NULL,        -- SCRUTINY, DEMAND, SHOW_CAUSE, etc.
    issued_by           VARCHAR(200),                 -- Tax authority / officer name
    issued_date         DATE NOT NULL,
    due_date            DATE,
    description         TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'RECEIVED'
                            CHECK (status IN (
                                'RECEIVED','ACKNOWLEDGED','IN_PROGRESS',
                                'RESPONSE_FILED','RESOLVED','ESCALATED'
                            )),
    document_id         UUID,                        -- Uploaded notice document
    response_document_id UUID,
    responded_at        TIMESTAMPTZ,
    responded_by        UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gst_notice_org_id ON gst.gst_notice (organization_id);
CREATE INDEX idx_gst_notice_status ON gst.gst_notice (status);
CREATE INDEX idx_gst_notice_due_date ON gst.gst_notice (due_date) WHERE status NOT IN ('RESOLVED');

ALTER TABLE gst.gst_notice ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gst_notice_updated_at
    BEFORE UPDATE ON gst.gst_notice
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.e_invoice
-- E-Invoice records (IRN generation via NIC portal — mandatory for turnover > 5Cr)
-- =============================================================================
CREATE TABLE gst.e_invoice (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    gst_invoice_id      UUID NOT NULL REFERENCES gst.gst_invoice (id),
    irn_number          VARCHAR(100) UNIQUE NOT NULL,
    ack_number          VARCHAR(100),
    ack_date            TIMESTAMPTZ,
    signed_invoice_data TEXT,                        -- Signed JSON from NIC
    signed_qr_code      TEXT,
    irn_status          VARCHAR(30) NOT NULL DEFAULT 'GENERATED'
                            CHECK (irn_status IN ('GENERATED','CANCELLED')),
    cancel_reason       VARCHAR(200),
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_e_invoice_org_id ON gst.e_invoice (organization_id);
CREATE INDEX idx_e_invoice_invoice_id ON gst.e_invoice (gst_invoice_id);
CREATE INDEX idx_e_invoice_irn ON gst.e_invoice (irn_number);

ALTER TABLE gst.e_invoice ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_e_invoice_updated_at
    BEFORE UPDATE ON gst.e_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.e_way_bill
-- E-Way Bill records (mandatory for goods movement > INR 50,000)
-- =============================================================================
CREATE TABLE gst.e_way_bill (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    ewb_number          VARCHAR(50) UNIQUE,
    gst_invoice_id      UUID REFERENCES gst.gst_invoice (id),
    supply_type         VARCHAR(50) NOT NULL,         -- OUTWARD, INWARD
    sub_supply_type     VARCHAR(100),
    transporter_id      VARCHAR(50),
    transporter_name    VARCHAR(300),
    vehicle_number      VARCHAR(20),
    vehicle_type        VARCHAR(30),
    distance_km         INTEGER,
    from_place          VARCHAR(200),
    from_pincode        VARCHAR(10),
    to_place            VARCHAR(200),
    to_pincode          VARCHAR(10),
    total_value         NUMERIC(20,2) NOT NULL,
    ewb_status          VARCHAR(30) NOT NULL DEFAULT 'GENERATED'
                            CHECK (ewb_status IN ('GENERATED','CANCELLED','EXTENDED','EXPIRED')),
    generated_at        TIMESTAMPTZ,
    valid_upto          TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_e_way_bill_org_id ON gst.e_way_bill (organization_id);
CREATE INDEX idx_e_way_bill_ewb_number ON gst.e_way_bill (ewb_number) WHERE ewb_number IS NOT NULL;
CREATE INDEX idx_e_way_bill_invoice_id ON gst.e_way_bill (gst_invoice_id) WHERE gst_invoice_id IS NOT NULL;

ALTER TABLE gst.e_way_bill ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_e_way_bill_updated_at
    BEFORE UPDATE ON gst.e_way_bill
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_reconciliation
-- GSTR-2A/2B reconciliation records
-- =============================================================================
CREATE TABLE gst.gst_reconciliation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    financial_year      VARCHAR(10) NOT NULL,
    period_month        SMALLINT NOT NULL,
    reconciliation_type VARCHAR(20) NOT NULL CHECK (reconciliation_type IN ('GSTR_2A','GSTR_2B')),
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','FAILED')),
    total_invoices      INTEGER NOT NULL DEFAULT 0,
    matched_count       INTEGER NOT NULL DEFAULT 0,
    mismatched_count    INTEGER NOT NULL DEFAULT 0,
    missing_count       INTEGER NOT NULL DEFAULT 0,
    itc_as_per_books    NUMERIC(20,2) NOT NULL DEFAULT 0,
    itc_as_per_gstr     NUMERIC(20,2) NOT NULL DEFAULT 0,
    reconciled_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gst_recon_org_id ON gst.gst_reconciliation (organization_id);
CREATE INDEX idx_gst_recon_fy_month ON gst.gst_reconciliation (financial_year, period_month);

ALTER TABLE gst.gst_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gst_reconciliation_updated_at
    BEFORE UPDATE ON gst.gst_reconciliation
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY gst_return_org_isolation ON gst.gst_return
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY gst_invoice_org_isolation ON gst.gst_invoice
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY itc_record_org_isolation ON gst.itc_record
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY itc_mismatch_org_isolation ON gst.itc_mismatch
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY gst_callback_org_isolation ON gst.gst_callback
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY gst_notice_org_isolation ON gst.gst_notice
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY e_invoice_org_isolation ON gst.e_invoice
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY e_way_bill_org_isolation ON gst.e_way_bill
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY gst_recon_org_isolation ON gst.gst_reconciliation
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));
