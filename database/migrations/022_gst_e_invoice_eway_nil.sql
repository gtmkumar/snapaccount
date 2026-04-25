-- =============================================================================
-- 022_gst_e_invoice_eway_nil.sql
-- Phase 6B — GST Completion
--
-- Adds three small operational-log tables:
--   - gst.e_invoice_irn_log  — IRP request/response log for IRN generation
--   - gst.e_way_bills        — EWB log (Phase-6B-aligned naming, plural)
--   - gst.nil_return_log     — log of nil-return filings (zero-transaction periods)
--
-- These coexist with the legacy `gst.e_invoice` and `gst.e_way_bill` tables
-- from 004_gst_schema.sql (kept untouched — additive principle).
--
-- BACKEND CONTRACT (cross-agent handoff):
--   - request_payload_jsonb / response_payload_jsonb store the full IRP request
--     and signed JSON response from the NIC portal. API tokens (auth headers,
--     bearer tokens, client_secret) MUST be redacted by the backend BEFORE
--     storing. Any path that writes a raw `Authorization` header into these
--     columns is a security bug.
--
-- RLS: org_id-scoped. Idempotent.
-- Depends on: 000_init.sql, 001_auth_schema.sql, 004_gst_schema.sql, 019_gst_invoices_line_items.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- gst.e_invoice_irn_log — IRN generation log (Phase 6B)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.e_invoice_irn_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,
    invoice_id              UUID REFERENCES gst.invoices (id),    -- new Phase-6B invoice table
    legacy_gst_invoice_id   UUID REFERENCES gst.gst_invoice (id), -- legacy 004_gst_schema invoice
    -- IRP outputs
    irn_number              VARCHAR(100),                         -- 64-char SHA256 hex from IRP
    ack_no                  VARCHAR(100),
    ack_date                TIMESTAMPTZ,
    qr_code                 TEXT,                                 -- signed QR code payload (base64)
    signed_invoice          TEXT,                                 -- signed JWS from NIC
    -- Request/response capture (REDACTED — see contract above)
    request_payload_jsonb   JSONB,
    response_payload_jsonb  JSONB,
    irp_endpoint            VARCHAR(200),                         -- which IRP endpoint was hit
    -- Status
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING','GENERATED','FAILED','CANCELLED')),
    error_code              VARCHAR(50),
    error_message           TEXT,
    cancel_reason           VARCHAR(200),
    cancelled_at            TIMESTAMPTZ,
    -- Adapter mode (mock vs production) — for ops triage
    adapter_mode            VARCHAR(20) NOT NULL DEFAULT 'MOCK'
                                CHECK (adapter_mode IN ('MOCK','PRODUCTION')),
    -- Audit
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_e_invoice_irn_log_org_id     ON gst.e_invoice_irn_log (org_id);
CREATE INDEX IF NOT EXISTS idx_e_invoice_irn_log_invoice_id ON gst.e_invoice_irn_log (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_e_invoice_irn_log_irn        ON gst.e_invoice_irn_log (irn_number) WHERE irn_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_e_invoice_irn_log_status     ON gst.e_invoice_irn_log (status, org_id);

ALTER TABLE gst.e_invoice_irn_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gst' AND tablename='e_invoice_irn_log' AND policyname='gst_e_invoice_irn_log_org_isolation') THEN
        CREATE POLICY gst_e_invoice_irn_log_org_isolation ON gst.e_invoice_irn_log
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_e_invoice_irn_log_updated_at') THEN
        CREATE TRIGGER trg_e_invoice_irn_log_updated_at
            BEFORE UPDATE ON gst.e_invoice_irn_log
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- gst.e_way_bills (plural — Phase 6B)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.e_way_bills (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,
    invoice_id              UUID REFERENCES gst.invoices (id),
    legacy_gst_invoice_id   UUID REFERENCES gst.gst_invoice (id),
    ewb_number              VARCHAR(50) UNIQUE,
    valid_from              TIMESTAMPTZ,
    valid_to                TIMESTAMPTZ,
    -- Vehicle / transport
    vehicle_no              VARCHAR(20),
    transport_mode          VARCHAR(20)
                                CHECK (transport_mode IS NULL OR transport_mode IN ('ROAD','RAIL','AIR','SHIP')),
    transporter_id          VARCHAR(50),
    transporter_name        VARCHAR(300),
    distance_km             INTEGER,
    -- Origin / destination
    from_pincode            VARCHAR(10),
    from_state_code         VARCHAR(2),
    to_pincode              VARCHAR(10),
    to_state_code           VARCHAR(2),
    total_value             NUMERIC(20,2),
    -- Status
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING','GENERATED','EXTENDED','CANCELLED','EXPIRED','FAILED')),
    error_code              VARCHAR(50),
    error_message           TEXT,
    cancel_reason           VARCHAR(200),
    cancelled_at            TIMESTAMPTZ,
    -- Request/response (REDACTED — see contract above)
    request_payload_jsonb   JSONB,
    response_payload_jsonb  JSONB,
    adapter_mode            VARCHAR(20) NOT NULL DEFAULT 'MOCK'
                                CHECK (adapter_mode IN ('MOCK','PRODUCTION')),
    -- Audit
    generated_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_e_way_bills_org_id     ON gst.e_way_bills (org_id);
CREATE INDEX IF NOT EXISTS idx_e_way_bills_invoice_id ON gst.e_way_bills (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_e_way_bills_status     ON gst.e_way_bills (status, org_id);
CREATE INDEX IF NOT EXISTS idx_e_way_bills_valid_to   ON gst.e_way_bills (valid_to) WHERE status = 'GENERATED';

ALTER TABLE gst.e_way_bills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gst' AND tablename='e_way_bills' AND policyname='gst_e_way_bills_org_isolation') THEN
        CREATE POLICY gst_e_way_bills_org_isolation ON gst.e_way_bills
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_e_way_bills_updated_at') THEN
        CREATE TRIGGER trg_e_way_bills_updated_at
            BEFORE UPDATE ON gst.e_way_bills
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- gst.nil_return_log — log of nil GSTR returns (zero-transaction periods)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.nil_return_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,
    gstin                   VARCHAR(15) NOT NULL
                                CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    return_type             VARCHAR(20) NOT NULL
                                CHECK (return_type IN ('GSTR-1','GSTR-3B','CMP-08','GSTR-9')),
    return_period           VARCHAR(7) NOT NULL,                  -- 'YYYY-MM' or 'YYYY-Q' for quarterly
    financial_year          VARCHAR(10) NOT NULL,                 -- e.g. '2024-25'
    -- Filing
    filed_at                TIMESTAMPTZ,
    filed_by                UUID,
    arn_number              VARCHAR(100),                         -- Acknowledgement Reference Number
    -- Confirmation
    user_confirmed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_confirmed_by       UUID NOT NULL,                        -- auth.user.id who confirmed nil
    -- Status
    status                  VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED'
                                CHECK (status IN ('CONFIRMED','SUBMITTED','FILED','FAILED')),
    error_code              VARCHAR(50),
    error_message           TEXT,
    adapter_mode            VARCHAR(20) NOT NULL DEFAULT 'MOCK'
                                CHECK (adapter_mode IN ('MOCK','PRODUCTION')),
    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (org_id, gstin, return_type, return_period)
);

CREATE INDEX IF NOT EXISTS idx_nil_return_log_org_id     ON gst.nil_return_log (org_id);
CREATE INDEX IF NOT EXISTS idx_nil_return_log_gstin      ON gst.nil_return_log (gstin);
CREATE INDEX IF NOT EXISTS idx_nil_return_log_period     ON gst.nil_return_log (financial_year, return_period);
CREATE INDEX IF NOT EXISTS idx_nil_return_log_status     ON gst.nil_return_log (status, org_id);

ALTER TABLE gst.nil_return_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gst' AND tablename='nil_return_log' AND policyname='gst_nil_return_log_org_isolation') THEN
        CREATE POLICY gst_nil_return_log_org_isolation ON gst.nil_return_log
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nil_return_log_updated_at') THEN
        CREATE TRIGGER trg_nil_return_log_updated_at
            BEFORE UPDATE ON gst.nil_return_log
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Backfill FK on gst.invoices for IRN/EWB linkage now that targets exist.
-- (gst.invoices.irn_log_id and .e_way_bill_id were created in 019 without FKs
-- to break a cyclical dependency. Add the FKs here, idempotently.)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_gst_invoices_irn_log_id'
    ) THEN
        ALTER TABLE gst.invoices
            ADD CONSTRAINT fk_gst_invoices_irn_log_id
            FOREIGN KEY (irn_log_id) REFERENCES gst.e_invoice_irn_log (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_gst_invoices_e_way_bill_id'
    ) THEN
        ALTER TABLE gst.invoices
            ADD CONSTRAINT fk_gst_invoices_e_way_bill_id
            FOREIGN KEY (e_way_bill_id) REFERENCES gst.e_way_bills (id);
    END IF;
END $$;

-- =============================================================================
-- End of 022_gst_e_invoice_eway_nil.sql
-- =============================================================================
