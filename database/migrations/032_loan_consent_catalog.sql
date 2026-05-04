-- =============================================================================
-- 032_loan_consent_catalog.sql
-- P6-HANDOFF-25 / SEC-050 — loan.consent_catalog table.
--
-- Backs GET /loans/consents/catalog. Mobile fetches the current version of
-- each consent type before presenting the consent screen, then echoes the
-- exact text_version in RecordConsent so the DPDP audit trail
-- (loan.consents.consent_text_version) ties back to the precise text the
-- user reviewed.
--
-- Seeds the three current consent types at version 1.4 (locale=en) so the
-- mobile fallback can be removed.
--
-- Idempotent. Additive.
-- =============================================================================

CREATE TABLE IF NOT EXISTS loan.consent_catalog (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_type        VARCHAR(60)  NOT NULL,
    text_version        VARCHAR(20)  NOT NULL,
    locale              VARCHAR(10)  NOT NULL DEFAULT 'en',
    body_md             TEXT         NOT NULL,
    effective_from      TIMESTAMPTZ  NOT NULL,
    retired_at          TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  NULL,
    created_by          UUID         NULL,
    last_modified_by    UUID         NULL,
    CONSTRAINT consent_type_chk CHECK (consent_type IN
        ('CREDIT_BUREAU', 'DATA_SHARE_WITH_BANK', 'DISBURSEMENT_MANDATE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_loan_consent_catalog_type_version_locale
    ON loan.consent_catalog (consent_type, text_version, locale);

CREATE INDEX IF NOT EXISTS idx_loan_consent_catalog_active
    ON loan.consent_catalog (consent_type, locale)
    WHERE retired_at IS NULL;

COMMENT ON TABLE loan.consent_catalog IS
    'P6-HANDOFF-25 / SEC-050: Versioned consent text catalog. Backs GET /loans/consents/catalog. text_version is echoed in loan.consents.consent_text_version for DPDP audit trail.';

-- ── Seed v1.4 (en) for the three current consent types ─────────────────────
INSERT INTO loan.consent_catalog (consent_type, text_version, locale, body_md, effective_from)
VALUES
    ('CREDIT_BUREAU', '1.4', 'en',
     'I authorise SnapAccount and partner banks to obtain my credit information from CIBIL/Experian/Equifax/CRIF for the purpose of evaluating this loan application. This consent is valid for 30 days.',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    ('DATA_SHARE_WITH_BANK', '1.4', 'en',
     'I consent to SnapAccount sharing my financial documents (ITR, bank statements, GST returns) with the selected partner bank for loan underwriting. The bank may retain copies per its policy.',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    ('DISBURSEMENT_MANDATE', '1.4', 'en',
     'I authorise the partner bank to disburse the approved loan amount directly to my registered bank account, after deducting any applicable processing fees as disclosed in the sanction letter.',
     TIMESTAMPTZ '2025-04-01 00:00:00+00')
ON CONFLICT ON CONSTRAINT ux_loan_consent_catalog_type_version_locale DO NOTHING;
