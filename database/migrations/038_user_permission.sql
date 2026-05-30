-- =============================================================================
-- 038_user_permission.sql
-- Auth/RBAC Module 1, Increment 1.3 — per-user direct permission overrides.
-- ADDITIVE, idempotent. Safe against a running AuthService (new table only).
--
-- Scope ref: .claude/orchestrator/auth-rbac-module-scope.md (§5e)
--
-- Semantics: a direct permission grant to a user, independent of their roles.
--   effective perms = (role perms) UNION (user_permission grants in scope),
--   with RETIRED permissions (auth.permission.is_active = FALSE) excluded.
--   organization_id NULL = platform/global grant; non-NULL = scoped to that org.
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.user_permission (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    permission_id       UUID NOT NULL REFERENCES auth.permission (id) ON DELETE CASCADE,
    organization_id     UUID REFERENCES auth.organization (id) ON DELETE CASCADE, -- NULL = platform/global grant
    granted_by_user_id  UUID REFERENCES auth.user (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_user_permission_user_id        ON auth.user_permission (user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_permission_id  ON auth.user_permission (permission_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_organization_id ON auth.user_permission (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_permission_granted_by     ON auth.user_permission (granted_by_user_id) WHERE granted_by_user_id IS NOT NULL;

-- One ACTIVE grant per (user, permission, scope). NULL org is normalized to the
-- nil UUID so platform-scoped grants dedupe too.
-- NOTE (backend): this is an EXPRESSION unique index. To use it as an ON CONFLICT
-- arbiter you must restate the exact expression:
--   ON CONFLICT (user_id, permission_id,
--                COALESCE(organization_id,'00000000-0000-0000-0000-000000000000'))
--   WHERE deleted_at IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permission_scope
    ON auth.user_permission (
        user_id,
        permission_id,
        COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::UUID)
    )
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_user_permission_updated_at ON auth.user_permission;
CREATE TRIGGER trg_user_permission_updated_at
    BEFORE UPDATE ON auth.user_permission
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row-Level Security — org isolation, consistent with auth.role / auth.invitation
-- (platform-admin bypass + app.current_user_id session var). Defense-in-depth;
-- delegation/escalation rules remain authoritative in the application layer.
-- -----------------------------------------------------------------------------
ALTER TABLE auth.user_permission ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permission_org_isolation ON auth.user_permission;
CREATE POLICY user_permission_org_isolation ON auth.user_permission
    USING (
        current_setting('app.is_platform_admin', TRUE) = 'true'
        -- Platform/global grants (no org scope)
        OR organization_id IS NULL
        -- Org-scoped grants visible only within the caller's owned/member orgs
        OR organization_id IN (
            SELECT id FROM auth.organization
            WHERE owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            UNION
            SELECT organization_id FROM auth.organization_member
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND is_active = TRUE
        )
    );

-- =============================================================================
-- End 038
-- =============================================================================
