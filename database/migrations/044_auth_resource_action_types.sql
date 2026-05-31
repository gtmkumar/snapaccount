-- =============================================================================
-- 044_auth_resource_action_types.sql
-- Auth/RBAC — ResourceTypes + ActionTypes catalogs (gap #3 vs the enhanced model).
-- Promotes the free-text permission.resource / permission.action strings into
-- first-class, configurable lookup tables, and links each permission to them via
-- nullable FKs. ADDITIVE, idempotent, backward-compatible: the existing
-- resource/action string columns are untouched and remain the source of truth for
-- [RequiresPermission] checks; the new FKs are metadata for the catalog UI and
-- let new resources/actions be added as data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.resource_type (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) NOT NULL,        -- matches permission.resource (e.g. 'gst')
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID,
    updated_by  UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_type_key ON auth.resource_type (key) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS auth.action_type (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) NOT NULL,        -- matches permission.action (e.g. 'returns.file')
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID,
    updated_by  UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_type_key ON auth.action_type (key) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_resource_type_updated_at ON auth.resource_type;
CREATE TRIGGER trg_resource_type_updated_at BEFORE UPDATE ON auth.resource_type
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
DROP TRIGGER IF EXISTS trg_action_type_updated_at ON auth.action_type;
CREATE TRIGGER trg_action_type_updated_at BEFORE UPDATE ON auth.action_type
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Seed from the distinct resource/action values already in the catalog.
-- name = initcap of the key with separators spaced out (a readable default).
INSERT INTO auth.resource_type (id, key, name)
SELECT gen_random_uuid(), r, initcap(replace(replace(r, '_', ' '), '.', ' '))
FROM (SELECT DISTINCT resource AS r FROM auth.permission WHERE deleted_at IS NULL AND resource <> '') s
ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO auth.action_type (id, key, name)
SELECT gen_random_uuid(), a, initcap(replace(replace(a, '_', ' '), '.', ' '))
FROM (SELECT DISTINCT action AS a FROM auth.permission WHERE deleted_at IS NULL AND action <> '') s
ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;

-- Link permissions to the catalogs (nullable FKs; string columns remain authoritative).
ALTER TABLE auth.permission ADD COLUMN IF NOT EXISTS resource_type_id UUID REFERENCES auth.resource_type (id) ON DELETE SET NULL;
ALTER TABLE auth.permission ADD COLUMN IF NOT EXISTS action_type_id   UUID REFERENCES auth.action_type (id)   ON DELETE SET NULL;

UPDATE auth.permission p
SET resource_type_id = rt.id
FROM auth.resource_type rt
WHERE rt.key = p.resource AND p.resource_type_id IS NULL AND rt.deleted_at IS NULL;

UPDATE auth.permission p
SET action_type_id = at.id
FROM auth.action_type at
WHERE at.key = p.action AND p.action_type_id IS NULL AND at.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_permission_resource_type ON auth.permission (resource_type_id) WHERE resource_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permission_action_type   ON auth.permission (action_type_id)   WHERE action_type_id IS NOT NULL;

-- =============================================================================
-- End 044
-- =============================================================================
