-- =============================================================================
-- 043_auth_permission_allow_deny.sql
-- Auth/RBAC — Allow/Deny semantics (gap #2 vs the enhanced authz model).
-- Adds an is_allowed flag to role and user permission grants so an explicit DENY
-- can subtract a permission a role would otherwise grant.
-- ADDITIVE, idempotent, backward-compatible: every existing row defaults to TRUE
-- (allow), so effective permissions are unchanged until a DENY row is authored.
--
-- Resolution (see EffectivePermissionResolver): effective = (all allows) MINUS
-- (all denies). Deny wins globally across roles + direct user grants. The "*"
-- wildcard super-admin is NOT constrained by deny (subtractive over concrete
-- permission names only) — a deliberate policy choice.
-- =============================================================================

ALTER TABLE auth.role_permission
    ADD COLUMN IF NOT EXISTS is_allowed BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE auth.user_permission
    ADD COLUMN IF NOT EXISTS is_allowed BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN auth.role_permission.is_allowed IS
    'TRUE = grant (allow); FALSE = explicit deny. Deny wins over allow in EffectivePermissionResolver.';
COMMENT ON COLUMN auth.user_permission.is_allowed IS
    'TRUE = direct grant (allow); FALSE = explicit per-user deny (overrides role allows).';

-- Partial indexes to make the deny legs cheap to scan (denies are rare).
CREATE INDEX IF NOT EXISTS idx_role_permission_deny
    ON auth.role_permission (role_id) WHERE is_allowed = FALSE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_permission_deny
    ON auth.user_permission (user_id) WHERE is_allowed = FALSE AND deleted_at IS NULL;

-- =============================================================================
-- End 043
-- =============================================================================
