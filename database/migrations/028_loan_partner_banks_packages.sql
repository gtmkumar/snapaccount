-- =============================================================================
-- 028_loan_partner_banks_packages.sql
-- Phase 6C — Loan Hub
-- Adds: loan.partner_banks       — adapter-aware partner bank registry
--       loan.application_status_log — full audit trail of status transitions
--       loan.pdf_packages        — generated loan-package PDFs (GCS pointer)
-- Additive. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM: loan.partner_bank_adapter_type
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_bank_adapter_type') THEN
        CREATE TYPE loan.partner_bank_adapter_type AS ENUM (
            'EMAIL',
            'REST',
            'OAUTH'
        );
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- loan.partner_banks
-- New adapter-aware bank registry (legacy loan.partner_bank kept for back-compat).
-- api_config_encrypted: JSONB, AES-GCM encrypted via ICredentialEncryptionService
-- (see backend handoff). DEK reference in shared.encryption_keys; never store
-- plaintext credentials.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.partner_banks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_code               VARCHAR(80) NOT NULL UNIQUE,             -- e.g. 'HDFC', 'ICICI', 'SBI'
    name                    VARCHAR(300) NOT NULL,
    logo_url                TEXT,
    adapter_type            loan.partner_bank_adapter_type NOT NULL,
    contact_email           VARCHAR(320),
    api_config_encrypted    JSONB,                                   -- AES-GCM ciphertext envelope
    api_config_key_ref      VARCHAR(200),                            -- Secret Manager / KMS key reference
    webhook_secret_ref      VARCHAR(200),                            -- Secret Manager ref for HMAC webhook secret
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_partner_banks_active   ON loan.partner_banks (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_partner_banks_adapter  ON loan.partner_banks (adapter_type);

DROP TRIGGER IF EXISTS trg_partner_banks_updated_at ON loan.partner_banks;
CREATE TRIGGER trg_partner_banks_updated_at
    BEFORE UPDATE ON loan.partner_banks
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Catalog: readable by all authenticated users; writes restricted at app layer.
ALTER TABLE loan.partner_banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_banks_read_all ON loan.partner_banks;
CREATE POLICY partner_banks_read_all ON loan.partner_banks
    FOR SELECT
    USING (deleted_at IS NULL AND is_active = TRUE);

-- Now wire the FK from loan.loan_products.bank_id (deferred from migration 026).
-- Done as a NOT VALID constraint (no validation against existing rows; new rows
-- enforced) since 026 ran without partner_banks populated.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_loan_products_bank_id'
    ) THEN
        ALTER TABLE loan.loan_products
            ADD CONSTRAINT fk_loan_products_bank_id
            FOREIGN KEY (bank_id) REFERENCES loan.partner_banks (id)
            NOT VALID;
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- loan.application_status_log
-- Append-only audit of every status transition on loan.applications.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.application_status_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          UUID NOT NULL REFERENCES loan.applications (id) ON DELETE CASCADE,
    from_status             loan.application_status_v2,              -- NULL on initial DRAFT creation
    to_status               loan.application_status_v2 NOT NULL,
    changed_by              UUID,                                    -- auth.user.id (or system actor)
    actor_type              VARCHAR(40),                             -- USER | CA | BANK | SYSTEM | WEBHOOK
    reason                  TEXT,
    metadata                JSONB,                                   -- bank ref, webhook payload digest, etc.
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Audit log: no updated_at, no deleted_at (append-only)
);

CREATE INDEX IF NOT EXISTS idx_app_status_log_app_id    ON loan.application_status_log (application_id);
CREATE INDEX IF NOT EXISTS idx_app_status_log_occurred  ON loan.application_status_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_status_log_to_status ON loan.application_status_log (to_status);

ALTER TABLE loan.application_status_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_status_log_isolation ON loan.application_status_log;
CREATE POLICY app_status_log_isolation ON loan.application_status_log
    FOR SELECT
    USING (
        application_id IN (
            SELECT a.id FROM loan.applications a
            WHERE a.org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
            )
        )
    );

-- Block hard-delete on audit log (immutability)
CREATE OR REPLACE FUNCTION loan.prevent_status_log_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'loan.application_status_log is append-only and cannot be deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_status_log_no_delete ON loan.application_status_log;
CREATE TRIGGER trg_status_log_no_delete
    BEFORE DELETE ON loan.application_status_log
    FOR EACH ROW EXECUTE FUNCTION loan.prevent_status_log_delete();

-- -----------------------------------------------------------------------------
-- loan.pdf_packages
-- Generated loan-package PDFs (watermarked, hashed, GCS-stored).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.pdf_packages (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          UUID NOT NULL REFERENCES loan.applications (id) ON DELETE CASCADE,
    gcs_uri                 TEXT NOT NULL,                           -- gs://bucket/loan-packages/{app}/{pkg}.pdf
    gcs_object_key          TEXT NOT NULL,                           -- bucket-relative key (for signed URL ops)
    pages_count             INTEGER NOT NULL CHECK (pages_count > 0),
    size_bytes              BIGINT,
    sha256_hash             BYTEA NOT NULL,                          -- 32 bytes; integrity proof
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by            UUID,                                    -- auth.user.id (CA / system)
    watermark_text          TEXT NOT NULL,
    is_submitted_to_bank    BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_to_bank_at    TIMESTAMPTZ,
    submitted_to_bank_id    UUID REFERENCES loan.partner_banks (id),
    -- Compliance retention: 7 years (DPDP + lending). GCS lifecycle mirrors this. PG 18 → app-side compute.
    retention_until         DATE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    CONSTRAINT ck_pdf_packages_sha256_len CHECK (octet_length(sha256_hash) = 32)
);

CREATE INDEX IF NOT EXISTS idx_pdf_packages_application_id ON loan.pdf_packages (application_id);
CREATE INDEX IF NOT EXISTS idx_pdf_packages_generated_at   ON loan.pdf_packages (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_packages_submitted_bank ON loan.pdf_packages (submitted_to_bank_id) WHERE submitted_to_bank_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pdf_packages_retention      ON loan.pdf_packages (retention_until);

DROP TRIGGER IF EXISTS trg_pdf_packages_updated_at ON loan.pdf_packages;
CREATE TRIGGER trg_pdf_packages_updated_at
    BEFORE UPDATE ON loan.pdf_packages
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Auto-set retention_until = generated_at + 7 years (trigger; STORED generated columns
-- can't use INTERVAL '7 years' because it's not immutable across timezones)
CREATE OR REPLACE FUNCTION loan.set_pdf_package_retention_until()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retention_until IS NULL THEN
        NEW.retention_until := (NEW.generated_at + INTERVAL '7 years')::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pdf_packages_retention_until ON loan.pdf_packages;
CREATE TRIGGER trg_pdf_packages_retention_until
    BEFORE INSERT ON loan.pdf_packages
    FOR EACH ROW EXECUTE FUNCTION loan.set_pdf_package_retention_until();

ALTER TABLE loan.pdf_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_packages_isolation ON loan.pdf_packages;
CREATE POLICY pdf_packages_isolation ON loan.pdf_packages
    USING (
        application_id IN (
            SELECT a.id FROM loan.applications a
            WHERE a.org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
            )
        )
    );
