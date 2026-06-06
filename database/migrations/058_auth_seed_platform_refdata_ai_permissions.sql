-- =============================================================================
-- 058_auth_seed_platform_refdata_ai_permissions.sql
-- Gap fix (User-Hierarchy analysis, Issue 7): two permissions are enforced in
-- code via [RequiresPermission] but were never seeded into auth.permission, so
-- they functioned ONLY through the SUPER_ADMIN wildcard grant — they could not
-- be granted to a custom role nor shown in the Permission Catalog / nav-permission
-- picker. This additive, idempotent seed registers them and grants both to
-- SUPER_ADMIN (parity with 036 §3a).
--
--   platform.refdata.manage  — ReferenceDataEndpoints (CRUD on reference data)
--   platform.ai.manage       — AI config commands
--
-- ADDITIVE, idempotent. Depends on 036.
-- =============================================================================

-- 1. Register the two missing permissions in the catalog.
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    p.name,
    split_part(p.name, '.', 1),
    substring(p.name FROM position('.' IN p.name) + 1),
    p.description
FROM (VALUES
    ('platform.refdata.manage', 'Manage platform reference data (states, industries, slabs…)'),
    ('platform.ai.manage',      'Manage AI provider configuration and feature overrides')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- 2. Grant both to SUPER_ADMIN (mirrors 036 §3a "every permission in the catalog").
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r
JOIN auth.permission p ON p.name IN ('platform.refdata.manage', 'platform.ai.manage')
WHERE r.name = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;
