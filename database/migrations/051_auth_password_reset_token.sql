-- =============================================================================
-- 051_auth_password_reset_token.sql
-- Auth — Password reset tokens (mirrors auth.refresh_token shape).
-- ADDITIVE migration. Extends 001_auth_schema.sql. Does NOT rewrite 001.
-- Idempotent / re-runnable.
--
--   - auth.password_reset_token: single-use, time-boxed reset tokens.
--   - token_hash: SHA-256 hex of the reset token — never store plaintext.
--   - used_at: set when the token is consumed (single-use enforcement in app).
--   - RLS: a user may only see/modify their own reset tokens
--     (mirrors 001 refresh_token_isolation, app.current_user_id session var).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- auth.password_reset_token — time-boxed, single-use password reset tokens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.password_reset_token (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,           -- SHA-256 hex of reset token
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,                    -- set when token is consumed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_user_id    ON auth.password_reset_token (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token_token_hash ON auth.password_reset_token (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_token_expires_at ON auth.password_reset_token (expires_at);

DROP TRIGGER IF EXISTS trg_password_reset_token_updated_at ON auth.password_reset_token;
CREATE TRIGGER trg_password_reset_token_updated_at
    BEFORE UPDATE ON auth.password_reset_token
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE auth.password_reset_token ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_token_isolation ON auth.password_reset_token;
CREATE POLICY password_reset_token_isolation ON auth.password_reset_token
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- =============================================================================
-- End 051
-- =============================================================================
