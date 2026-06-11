-- =============================================================================
-- 089_auth_device_integrity_checks.sql
-- GAP-064: Device-integrity (Play Integrity / App Attest) soft-fail telemetry
--
-- Creates:
--   auth.device_integrity_checks — append-only telemetry log of device-integrity
--                                  attestation outcomes recorded by the auth
--                                  middleware on protected endpoints.
--
-- Soft-fail design (GAP-064): the DeviceIntegrityMiddleware NEVER blocks a
-- request on a failed/unavailable attestation during the soft-launch. Instead it
-- writes one row here per evaluated request (verdict = PASS | FAIL | UNAVAILABLE
-- | SKIPPED, etc.), so that abuse patterns can be observed and an enforcement
-- threshold tuned before any hard block is switched on. This is server-side
-- security telemetry consumed by admin dashboards — NOT user-facing data.
--
-- RLS decision: NO row-level security (matches the auth log-table precedent:
--   auth.otp_request, auth.ai_usage_log, loan.fraud_checks). user_id is nullable
--   (attestation can be evaluated before auth resolves, e.g. on OTP-send), and
--   admin/security dashboards must read across ALL users — per-user isolation
--   would break the table's only read path. The backend is the sole writer.
--
-- ADDITIVE / IDEMPOTENT — safe to re-run.
-- UUID audit columns (id, created_by, updated_by) — never varchar (past bug class).
-- FK to auth user uses the quoted reserved identifier auth."user"(id) (house
--   convention; an unquoted auth.user resolves to the same relation but the
--   quoted form is canonical across migrations 083 etc.).
-- Depends on: 001_auth_schema.sql (auth.user exists).
-- Backend pairing: AuthService.Domain/Entities/DeviceIntegrityCheck.cs +
--   Infrastructure/Persistence/Configurations/DeviceIntegrityCheckConfiguration.cs
--   (this migration is the canonical DDL; the EF config maps it 1:1).
-- =============================================================================

-- ── 1. auth.device_integrity_checks ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.device_integrity_checks (
    id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID         REFERENCES auth."user"(id) ON DELETE SET NULL,
    organization_id UUID,
    platform        VARCHAR(20),                       -- android | ios | web (nullable)
    verdict         VARCHAR(20)  NOT NULL,             -- PASS | FAIL | UNAVAILABLE | SKIPPED
    endpoint        VARCHAR(256) NOT NULL,             -- protected route the check guarded
    failure_reason  VARCHAR(500),                      -- null on PASS; cause string on FAIL/UNAVAILABLE
    client_ip       VARCHAR(64),                       -- remote IP at evaluation time
    recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- BaseAuditableEntity columns (uuid — never varchar, past bug class)
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

COMMENT ON TABLE auth.device_integrity_checks IS
    'GAP-064: Append-only device-integrity (Play Integrity / App Attest) soft-fail '
    'telemetry. One row per attestation evaluation on a protected endpoint. '
    'Soft-launch never blocks the request — it records the verdict so an '
    'enforcement threshold can be tuned. Server-side security telemetry, '
    'admin-consumed; no RLS (nullable user_id; cross-user admin read path).';

COMMENT ON COLUMN auth.device_integrity_checks.user_id IS
    'Authenticated user when known; NULL when the check ran before auth resolved '
    '(e.g. OTP-send). FK auth."user"(id) ON DELETE SET NULL — telemetry survives '
    'user deletion as anonymized rows.';

COMMENT ON COLUMN auth.device_integrity_checks.organization_id IS
    'Org context when known (no FK — denormalized for fast dashboard filtering).';

COMMENT ON COLUMN auth.device_integrity_checks.platform IS
    'Client platform: android | ios | web. Nullable when undeterminable.';

COMMENT ON COLUMN auth.device_integrity_checks.verdict IS
    'Attestation outcome: PASS (attested genuine), FAIL (attestation rejected), '
    'UNAVAILABLE (provider/token absent), SKIPPED (not applicable). '
    'NOT NULL — every evaluated request records a verdict.';

COMMENT ON COLUMN auth.device_integrity_checks.endpoint IS
    'The protected route the integrity check guarded (for per-endpoint analysis).';

COMMENT ON COLUMN auth.device_integrity_checks.failure_reason IS
    'NULL on PASS; human-readable cause on FAIL/UNAVAILABLE (e.g. provider error, '
    'nonce mismatch). Bounded to 500 chars.';

COMMENT ON COLUMN auth.device_integrity_checks.recorded_at IS
    'Timestamp the attestation was evaluated (drives time-series dashboards). '
    'Distinct from created_at to keep audit-column semantics uniform.';

-- ── 2. Indexes — time-series + verdict-bucketed dashboard queries ─────────────

CREATE INDEX IF NOT EXISTS ix_device_integrity_checks_recorded_at
    ON auth.device_integrity_checks (recorded_at);

CREATE INDEX IF NOT EXISTS ix_device_integrity_checks_user_id_recorded_at
    ON auth.device_integrity_checks (user_id, recorded_at);

CREATE INDEX IF NOT EXISTS ix_device_integrity_checks_verdict
    ON auth.device_integrity_checks (verdict);

-- ── 3. RLS — intentionally NOT enabled ───────────────────────────────────────
-- See header. Log-table precedent (auth.otp_request, auth.ai_usage_log,
-- loan.fraud_checks): backend is sole writer; admin/security dashboards read
-- across all users; user_id is nullable. Per-user RLS would break the read path.
