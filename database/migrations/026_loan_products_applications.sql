-- =============================================================================
-- 026_loan_products_applications.sql
-- Phase 6C — Loan Hub
-- Adds: loan.loan_products (per-bank product catalog) + loan.applications
--       (Phase 6C lifecycle entity, distinct from legacy loan.loan_application)
-- Additive. Idempotent. RLS by org_id; user-scoped reads.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM: loan.application_status_v2
-- New 6C lifecycle states (kept distinct from the legacy CHECK enum on
-- loan.loan_application.status to avoid touching that table).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status_v2') THEN
        CREATE TYPE loan.application_status_v2 AS ENUM (
            'DRAFT',
            'SUBMITTED',
            'UNDER_REVIEW',
            'DOCS_REQUESTED',
            'APPROVED',
            'REJECTED',
            'DISBURSED',
            'CLOSED'
        );
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- loan.loan_products
-- Per-bank product catalog. References legacy loan.partner_bank for now;
-- will be migrated to loan.partner_banks (migration 028) via a nullable FK
-- once the new partner registry is populated.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.loan_products (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id                     UUID NOT NULL,                       -- FK added in 028 to loan.partner_banks
    product_code                VARCHAR(80)  NOT NULL,
    product_name                VARCHAR(300) NOT NULL,
    description                 TEXT,
    min_amount                  NUMERIC(15,2) NOT NULL,
    max_amount                  NUMERIC(15,2) NOT NULL,
    interest_rate_min_pct       NUMERIC(6,3),
    interest_rate_max_pct       NUMERIC(6,3),
    tenure_min_months           SMALLINT NOT NULL,
    tenure_max_months           SMALLINT NOT NULL,
    eligibility_criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- min vintage, turnover, score, etc.
    processing_fee_pct          NUMERIC(5,2),
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID,
    CONSTRAINT uq_loan_products_bank_code UNIQUE (bank_id, product_code),
    CONSTRAINT ck_loan_products_amount    CHECK (max_amount >= min_amount),
    CONSTRAINT ck_loan_products_tenure    CHECK (tenure_max_months >= tenure_min_months)
);

CREATE INDEX IF NOT EXISTS idx_loan_products_bank_id    ON loan.loan_products (bank_id);
CREATE INDEX IF NOT EXISTS idx_loan_products_is_active  ON loan.loan_products (is_active) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_loan_products_updated_at ON loan.loan_products;
CREATE TRIGGER trg_loan_products_updated_at
    BEFORE UPDATE ON loan.loan_products
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Catalog table: not user-owned; readable by all authenticated users.
ALTER TABLE loan.loan_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_products_read_all ON loan.loan_products;
CREATE POLICY loan_products_read_all ON loan.loan_products
    FOR SELECT
    USING (deleted_at IS NULL AND is_active = TRUE);

-- -----------------------------------------------------------------------------
-- loan.applications
-- Phase 6C application entity. Independent of the legacy loan.loan_application
-- (which remains for EMI/disbursement legacy records).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.applications (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                      UUID NOT NULL,                       -- auth.organization.id
    user_id                     UUID NOT NULL,                       -- auth.user.id (applicant)
    loan_product_id             UUID NOT NULL REFERENCES loan.loan_products (id),
    requested_amount            NUMERIC(15,2) NOT NULL CHECK (requested_amount > 0),
    tenure_months               SMALLINT NOT NULL CHECK (tenure_months > 0),
    purpose                     TEXT,
    status                      loan.application_status_v2 NOT NULL DEFAULT 'DRAFT',
    submitted_at                TIMESTAMPTZ,
    bank_reference_no           VARCHAR(120),
    disbursed_at                TIMESTAMPTZ,
    disbursed_amount            NUMERIC(15,2),
    rejection_reason            TEXT,
    -- DPDP anonymization (consents NEVER hard-deleted; PII nulled instead)
    anonymized_at               TIMESTAMPTZ,
    anonymization_reason        VARCHAR(200),
    -- Compliance retention: 7 years (lending + DPDP).
    -- PG 18 deems the cast through tz non-immutable; computed by application layer instead.
    retention_until             DATE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

CREATE INDEX IF NOT EXISTS idx_applications_org_id          ON loan.applications (org_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_id         ON loan.applications (user_id);
CREATE INDEX IF NOT EXISTS idx_applications_product_id      ON loan.applications (loan_product_id);
CREATE INDEX IF NOT EXISTS idx_applications_status          ON loan.applications (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_applications_submitted_at    ON loan.applications (submitted_at) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_bank_ref        ON loan.applications (bank_reference_no) WHERE bank_reference_no IS NOT NULL;

DROP TRIGGER IF EXISTS trg_applications_updated_at ON loan.applications;
CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON loan.applications
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Auto-set retention_until = created_at + 7 years (trigger; STORED generated columns
-- can't use INTERVAL '7 years' because it's not immutable across timezones)
CREATE OR REPLACE FUNCTION loan.set_application_retention_until()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retention_until IS NULL THEN
        NEW.retention_until := (NEW.created_at + INTERVAL '7 years')::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_applications_retention_until ON loan.applications;
CREATE TRIGGER trg_applications_retention_until
    BEFORE INSERT ON loan.applications
    FOR EACH ROW EXECUTE FUNCTION loan.set_application_retention_until();

ALTER TABLE loan.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_org_isolation ON loan.applications;
CREATE POLICY applications_org_isolation ON loan.applications
    USING (
        org_id IN (
            SELECT om.organization_id FROM auth.organization_member om
            WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND om.is_active = TRUE
        )
    );

DROP POLICY IF EXISTS applications_user_read ON loan.applications;
CREATE POLICY applications_user_read ON loan.applications
    FOR SELECT
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
