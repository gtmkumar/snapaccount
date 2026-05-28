-- =============================================================================
-- 027_loan_documents_consents.sql
-- Phase 6C — Loan Hub
-- Adds: loan.application_documents (links uploaded docs to applications)
--       loan.consents (DPDP-compliant signed consent capture; HMAC-SHA256)
-- Additive. Idempotent. DPDP cascade: anonymize, never hard-delete.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM: loan.application_document_type
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_document_type') THEN
        CREATE TYPE loan.application_document_type AS ENUM (
            'PAN',
            'AADHAAR',
            'GSTR3B',
            'PL',
            'BS',
            'BANK_STMT',
            'ITR',
            'TRADE_LICENSE'
        );
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- ENUM: loan.application_document_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_document_status') THEN
        CREATE TYPE loan.application_document_status AS ENUM (
            'PENDING',
            'UPLOADED',
            'VERIFIED',
            'REJECTED',
            'EXPIRED'
        );
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- ENUM: loan.consent_type
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_type') THEN
        CREATE TYPE loan.consent_type AS ENUM (
            'CREDIT_BUREAU',
            'DATA_SHARE_WITH_BANK',
            'DISBURSEMENT_MANDATE'
        );
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- loan.application_documents
-- Map application -> document.document (partitioned table) with type+status.
-- NOTE: FK to document.document is intentionally NOT enforced because that
-- table is partitioned by created_at; cross-partition FK would require
-- non-trivial constraint setup. We enforce referential integrity in the
-- application layer (LoanService.Application).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.application_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID NOT NULL REFERENCES loan.applications (id) ON DELETE CASCADE,
    document_id         UUID NOT NULL,                                  -- document.document.id (logical FK)
    document_type       loan.application_document_type NOT NULL,
    status              loan.application_document_status NOT NULL DEFAULT 'PENDING',
    verified_at         TIMESTAMPTZ,
    verified_by         UUID,
    rejection_reason    TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT uq_app_docs_app_type_doc UNIQUE (application_id, document_type, document_id)
);

CREATE INDEX IF NOT EXISTS idx_app_docs_application_id ON loan.application_documents (application_id);
CREATE INDEX IF NOT EXISTS idx_app_docs_document_id    ON loan.application_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_app_docs_type_status    ON loan.application_documents (document_type, status);

DROP TRIGGER IF EXISTS trg_app_docs_updated_at ON loan.application_documents;
CREATE TRIGGER trg_app_docs_updated_at
    BEFORE UPDATE ON loan.application_documents
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE loan.application_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_docs_isolation ON loan.application_documents;
CREATE POLICY app_docs_isolation ON loan.application_documents
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

-- -----------------------------------------------------------------------------
-- loan.consents
-- Tamper-resistant consent record. signature_hash = HMAC-SHA256(
--   user_id || app_id || consent_text_version || timestamp, server_key
-- ). Server key sourced from Secret Manager; never persisted in DB.
--
-- DPDP / RBI retention: consents are NEVER hard-deleted. On user erasure,
-- the application layer NULLs user-identifying columns (user_id, ip_address,
-- user_agent) and sets anonymized_at + anonymization_reason. The signed
-- consent record itself is retained 7 years for compliance.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan.consents (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id              UUID NOT NULL REFERENCES loan.applications (id),
    user_id                     UUID,                                -- nullable post-anonymization
    consent_type                loan.consent_type NOT NULL,
    consent_text_version        VARCHAR(50) NOT NULL,
    consent_text_hash           BYTEA,                               -- SHA-256 of exact consent text shown
    signed_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address                  INET,
    user_agent                  TEXT,
    signature_hash              BYTEA NOT NULL,                      -- HMAC-SHA256, 32 bytes
    -- DPDP anonymization (compliance: retain record, scrub PII)
    anonymized_at               TIMESTAMPTZ,
    anonymization_reason        VARCHAR(200),
    -- Compliance retention: 7 years (PG 18 immutability — computed app-side).
    retention_until             DATE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- NOTE: deliberately NO deleted_at — consents are not soft-deletable.
    created_by                  UUID,
    updated_by                  UUID,
    CONSTRAINT uq_consents_app_type_version UNIQUE (application_id, consent_type, consent_text_version),
    CONSTRAINT ck_consents_signature_len    CHECK (octet_length(signature_hash) = 32)
);

CREATE INDEX IF NOT EXISTS idx_consents_application_id ON loan.consents (application_id);
CREATE INDEX IF NOT EXISTS idx_consents_user_id        ON loan.consents (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_signed_at      ON loan.consents (signed_at);
CREATE INDEX IF NOT EXISTS idx_consents_retention      ON loan.consents (retention_until);

DROP TRIGGER IF EXISTS trg_consents_updated_at ON loan.consents;
CREATE TRIGGER trg_consents_updated_at
    BEFORE UPDATE ON loan.consents
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Auto-set retention_until = signed_at + 7 years (trigger; STORED generated columns
-- can't use INTERVAL '7 years' because it's not immutable across timezones)
CREATE OR REPLACE FUNCTION loan.set_consent_retention_until()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retention_until IS NULL AND NEW.signed_at IS NOT NULL THEN
        NEW.retention_until := (NEW.signed_at + INTERVAL '7 years')::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consents_retention_until ON loan.consents;
CREATE TRIGGER trg_consents_retention_until
    BEFORE INSERT ON loan.consents
    FOR EACH ROW EXECUTE FUNCTION loan.set_consent_retention_until();

ALTER TABLE loan.consents ENABLE ROW LEVEL SECURITY;

-- Block hard-deletes at DB level (compliance)
CREATE OR REPLACE FUNCTION loan.prevent_consent_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'loan.consents records cannot be deleted (DPDP/RBI retention). Use anonymization instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consents_no_delete ON loan.consents;
CREATE TRIGGER trg_consents_no_delete
    BEFORE DELETE ON loan.consents
    FOR EACH ROW EXECUTE FUNCTION loan.prevent_consent_delete();

DROP POLICY IF EXISTS consents_isolation ON loan.consents;
CREATE POLICY consents_isolation ON loan.consents
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
