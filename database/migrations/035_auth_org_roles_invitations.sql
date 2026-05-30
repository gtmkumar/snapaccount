-- =============================================================================
-- 035_auth_org_roles_invitations.sql
-- Auth/RBAC Module 1 — Multi-tenant org-scoped custom roles + invitations.
-- ADDITIVE migration. Extends 001_auth_schema.sql. Does NOT rewrite 001.
-- Idempotent / re-runnable.
--
-- Scope ref: .claude/orchestrator/auth-rbac-module-scope.md (§2, §4 db-engineer)
--   - auth.role.organization_id  (NULL = system/global role; non-NULL = org custom role)
--   - auth.role.created_by_user_id (provenance)
--   - Replace global UNIQUE(name) with TWO partial unique indexes (multi-tenant safe)
--   - auth.invitation table (org-scoped, token-based, soft-delete, RLS)
--   - RLS org-isolation on custom roles + invitations, with platform-admin bypass
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. auth.role — add org-scoping + provenance columns
-- -----------------------------------------------------------------------------
ALTER TABLE auth.role
    ADD COLUMN IF NOT EXISTS organization_id     UUID NULL,
    ADD COLUMN IF NOT EXISTS created_by_user_id  UUID NULL;

-- FK: org-scoped roles belong to an organization. NULL = system/global role.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'auth'
          AND table_name = 'role'
          AND constraint_name = 'fk_role_organization_id'
    ) THEN
        ALTER TABLE auth.role
            ADD CONSTRAINT fk_role_organization_id
            FOREIGN KEY (organization_id) REFERENCES auth.organization (id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'auth'
          AND table_name = 'role'
          AND constraint_name = 'fk_role_created_by_user_id'
    ) THEN
        ALTER TABLE auth.role
            ADD CONSTRAINT fk_role_created_by_user_id
            FOREIGN KEY (created_by_user_id) REFERENCES auth.user (id) ON DELETE SET NULL;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Replace global UNIQUE(name) on auth.role with multi-tenant-safe partials.
--    Pre-production: no rows seeded yet, so replacing is safe.
--    Drop whatever unique constraint exists on auth.role(name) by its actual
--    name (PG auto-named it 'role_name_key' for the inline UNIQUE in 001).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    con_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO con_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_schema = 'auth'
      AND tc.table_name = 'role'
      AND tc.constraint_type = 'UNIQUE'
      AND ccu.column_name = 'name'
    LIMIT 1;

    IF con_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE auth.role DROP CONSTRAINT %I', con_name);
    END IF;
END $$;

-- System/global roles (organization_id IS NULL) remain globally unique by name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_system_name
    ON auth.role (name)
    WHERE organization_id IS NULL AND deleted_at IS NULL;

-- Custom roles are unique by name WITHIN their organization (org A & org B may
-- both create a "Manager" / "HR" role).
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_org_name
    ON auth.role (organization_id, name)
    WHERE organization_id IS NOT NULL AND deleted_at IS NULL;

-- Lookup index for org-scoped role queries.
CREATE INDEX IF NOT EXISTS idx_role_organization_id
    ON auth.role (organization_id)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_created_by_user_id
    ON auth.role (created_by_user_id)
    WHERE created_by_user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. auth.invitation — token-based org member invitations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.invitation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id) ON DELETE CASCADE,
    email               VARCHAR(320),                   -- at least one of email/phone (CHECK)
    phone_number        VARCHAR(15),                    -- E.164, e.g. +919876543210
    role_id             UUID NOT NULL REFERENCES auth.role (id),
    invited_by_user_id  UUID NOT NULL REFERENCES auth.user (id),
    token_hash          VARCHAR(256) NOT NULL UNIQUE,   -- SHA-256 of invite token — never store plaintext
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
    expires_at          TIMESTAMPTZ NOT NULL,
    accepted_at         TIMESTAMPTZ,
    accepted_user_id    UUID REFERENCES auth.user (id), -- set when invite is accepted
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT chk_invitation_contact CHECK (email IS NOT NULL OR phone_number IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_invitation_organization_id   ON auth.invitation (organization_id);
CREATE INDEX IF NOT EXISTS idx_invitation_role_id           ON auth.invitation (role_id);
CREATE INDEX IF NOT EXISTS idx_invitation_invited_by        ON auth.invitation (invited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_token_hash        ON auth.invitation (token_hash);
CREATE INDEX IF NOT EXISTS idx_invitation_accepted_user_id  ON auth.invitation (accepted_user_id) WHERE accepted_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitation_status            ON auth.invitation (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitation_email             ON auth.invitation (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitation_expires_at        ON auth.invitation (expires_at);

DROP TRIGGER IF EXISTS trg_invitation_updated_at ON auth.invitation;
CREATE TRIGGER trg_invitation_updated_at
    BEFORE UPDATE ON auth.invitation
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE auth.invitation ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Row-Level Security — org isolation for custom roles + invitations
--    Consistent with 001 policies (app.current_user_id session var).
--    Platform-admin (SUPER_ADMIN) bypass via app.is_platform_admin = 'true'.
--    RLS is defense-in-depth; authoritative delegation/escalation guards live
--    in the backend application layer (see scope §4 backend-agent).
-- -----------------------------------------------------------------------------

-- auth.role was not RLS-enabled in 001 (system roles are global/read-mostly).
-- Enable it now so org-scoped custom roles are isolated per tenant.
ALTER TABLE auth.role ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_org_isolation ON auth.role;
CREATE POLICY role_org_isolation ON auth.role
    USING (
        -- Platform admin sees everything
        current_setting('app.is_platform_admin', TRUE) = 'true'
        -- System/global roles are visible to everyone (read-only to org admins)
        OR organization_id IS NULL
        -- Custom roles visible only within the caller's organization(s)
        OR organization_id IN (
            SELECT id FROM auth.organization
            WHERE owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            UNION
            SELECT organization_id FROM auth.organization_member
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND is_active = TRUE
        )
    );

DROP POLICY IF EXISTS invitation_org_isolation ON auth.invitation;
CREATE POLICY invitation_org_isolation ON auth.invitation
    USING (
        current_setting('app.is_platform_admin', TRUE) = 'true'
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
-- End 035
-- =============================================================================
