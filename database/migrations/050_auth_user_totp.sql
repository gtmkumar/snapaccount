-- =============================================================================
-- 050_auth_user_totp.sql
-- Auth — Two-Factor Authentication (TOTP) per user.
-- ADDITIVE migration. Extends 001_auth_schema.sql. Does NOT rewrite 001.
-- Idempotent / re-runnable.
--
--   - auth.user_totp: one TOTP secret per user (UNIQUE user_id).
--   - secret_encrypted: TOTP shared secret, ENCRYPTED AT REST by the app layer
--     before storage. Never store plaintext secrets.
--   - recovery_codes: JSON array of HASHED one-time recovery codes (nullable).
--   - RLS: a user may only see/modify their own TOTP record (mirrors 001 policies,
--     app.current_user_id session var).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- auth.user_totp — TOTP 2FA enrollment per user
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.user_totp (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.user (id) ON DELETE CASCADE,
    secret_encrypted    TEXT NOT NULL,                  -- TOTP secret, encrypted at rest by app
    is_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at        TIMESTAMPTZ,                    -- set when user confirms first valid code
    recovery_codes      TEXT,                          -- JSON array of HASHED recovery codes (nullable)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_user_totp_user_id ON auth.user_totp (user_id);

DROP TRIGGER IF EXISTS trg_user_totp_updated_at ON auth.user_totp;
CREATE TRIGGER trg_user_totp_updated_at
    BEFORE UPDATE ON auth.user_totp
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE auth.user_totp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_totp_isolation ON auth.user_totp;
CREATE POLICY user_totp_isolation ON auth.user_totp
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- =============================================================================
-- End 050
-- =============================================================================
