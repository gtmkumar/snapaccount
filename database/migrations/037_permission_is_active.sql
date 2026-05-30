-- =============================================================================
-- 037_permission_is_active.sql
-- Auth/RBAC Module 1, Increment 1.2 — soft-retire permissions via is_active flag.
-- ADDITIVE, idempotent. Safe against a running AuthService
-- (nullable-with-default column; backfills existing rows to TRUE).
--
-- Scope ref: .claude/orchestrator/auth-rbac-module-scope.md (§5d)
--
-- Semantics: is_active = FALSE means a RETIRED permission — excluded from the
-- role matrix, /me/grantable-permissions, and effective-permission computation.
-- A delete still soft-removes (deleted_at). is_active is the "retired but kept
-- for history/audit" state, distinct from soft-delete.
-- =============================================================================

ALTER TABLE auth.permission
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial index: matrix / grantable / effective-perm queries filter to the
-- live catalog (active AND not soft-deleted). Keeps those hot paths index-only.
CREATE INDEX IF NOT EXISTS idx_permission_is_active
    ON auth.permission (is_active)
    WHERE is_active = TRUE AND deleted_at IS NULL;

-- =============================================================================
-- End 037
-- =============================================================================
