-- =============================================================================
-- 052_auth_kyc_verification.sql
-- Auth — KYC verification records (PAN / Aadhaar).
-- ADDITIVE migration. Extends 001_auth_schema.sql. Does NOT rewrite 001.
-- Idempotent / re-runnable.
--
--   - auth.kyc_verification: per-user identity verification attempts/results.
--   - kind: 'PAN' or 'AADHAAR'.
--   - reference_number: PAN (XXXXX9999X) or MASKED Aadhaar — never store full
--     Aadhaar in clear (DPDP Act 2023).
--   - status: PENDING -> VERIFIED / FAILED.
--   - provider / provider_ref: 3rd-party KYC provider name and their reference id.
--   - RLS: a user may only see/modify their own KYC records
--     (mirrors 001 policies, app.current_user_id session var).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- auth.kyc_verification — PAN / Aadhaar KYC verification records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.kyc_verification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK (kind IN ('PAN','AADHAAR')),
    reference_number    TEXT NOT NULL,                 -- PAN or MASKED Aadhaar
    status              TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','VERIFIED','FAILED')),
    provider            TEXT,                          -- KYC provider name
    provider_ref        TEXT,                          -- provider-side reference id
    verified_at         TIMESTAMPTZ,                   -- set when status -> VERIFIED
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_kyc_verification_user_id      ON auth.kyc_verification (user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verification_user_id_kind ON auth.kyc_verification (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_kyc_verification_status       ON auth.kyc_verification (status) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_kyc_verification_updated_at ON auth.kyc_verification;
CREATE TRIGGER trg_kyc_verification_updated_at
    BEFORE UPDATE ON auth.kyc_verification
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE auth.kyc_verification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyc_verification_isolation ON auth.kyc_verification;
CREATE POLICY kyc_verification_isolation ON auth.kyc_verification
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- =============================================================================
-- End 052
-- =============================================================================
