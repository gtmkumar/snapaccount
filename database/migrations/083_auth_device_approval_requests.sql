-- =============================================================================
-- 083_auth_device_approval_requests.sql
-- GAP-047: Old-device confirmation on new-device login
--
-- Creates:
--   auth.device_approval_requests — pending approval table (10-min expiry)
--
-- ADDITIVE / IDEMPOTENT — safe to re-run.
-- UUID audit columns (id, created_by, updated_by) — never varchar (past bug class).
-- Depends on: 066_phase7_ef_reconciliation_additive.sql (auth schema + user_device exist)
-- =============================================================================

-- ── 1. auth.device_approval_requests ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.device_approval_requests (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 UUID        NOT NULL
                                        REFERENCES auth."user"(id) ON DELETE CASCADE,
    new_device_id           UUID        NOT NULL
                                        REFERENCES auth.user_device(id) ON DELETE CASCADE,
    new_device_identifier   VARCHAR(256) NOT NULL,
    new_device_name         VARCHAR(200),
    new_device_platform     VARCHAR(20) NOT NULL,
    expires_at              TIMESTAMPTZ NOT NULL,
    status                  VARCHAR(20)  NOT NULL DEFAULT 'Pending',  -- Pending | Approved | Denied | Expired
    reviewed_by_device_id   UUID,
    reviewed_at             TIMESTAMPTZ,
    denial_reason           VARCHAR(500),
    -- FK to auth.refresh_token: the pending session token to revoke on denial (enforce=true)
    new_device_session_token_id UUID,

    -- BaseAuditableEntity columns (uuid — never varchar, past bug class)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

COMMENT ON TABLE auth.device_approval_requests IS
    'GAP-047: Pending new-device login approval requests. '
    'Created when a user logs in on a new device when at least one registered device already exists. '
    'An existing device must approve or deny within 10 minutes (expires_at). '
    'Soft-launch: DeviceApproval:Enforce=false (default) means denial is logged only.';

COMMENT ON COLUMN auth.device_approval_requests.status IS
    'Pending = awaiting review. Approved = existing device approved. '
    'Denied = existing device denied (new device session revoked when enforce=true). '
    'Expired = 10-minute window elapsed without decision.';

COMMENT ON COLUMN auth.device_approval_requests.new_device_session_token_id IS
    'Links to auth.refresh_token(id) for the pending session. '
    'Used to revoke the new device session when denied (enforce=true).';

-- Indexes for query patterns
CREATE INDEX IF NOT EXISTS ix_dar_user_id_status
    ON auth.device_approval_requests (user_id, status);

CREATE INDEX IF NOT EXISTS ix_dar_new_device_id
    ON auth.device_approval_requests (new_device_id);

CREATE INDEX IF NOT EXISTS ix_dar_expires_at
    ON auth.device_approval_requests (expires_at);

-- ── 2. Periodic cleanup: mark Pending requests as Expired after window ────────
-- A Hangfire job or a DB trigger can call this; it is also enforced in the
-- IsActive domain property (checked on every approve/deny action).
-- No trigger added here to avoid complexity; the application IS the source of truth.
-- The Hangfire job (GAP-047-cleanup) should run every 5 minutes.

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
-- Row-level security on device_approval_requests: users can only see their own rows.
-- Using the same app.current_user_id session variable as the RLS policy on auth.users.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'auth'
          AND tablename  = 'device_approval_requests'
          AND policyname = 'device_approval_requests_user_isolation'
    ) THEN
        ALTER TABLE auth.device_approval_requests ENABLE ROW LEVEL SECURITY;
        ALTER TABLE auth.device_approval_requests FORCE ROW LEVEL SECURITY;

        CREATE POLICY device_approval_requests_user_isolation
            ON auth.device_approval_requests
            USING (
                user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            );
    END IF;
END
$$;
