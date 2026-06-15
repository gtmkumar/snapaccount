-- =============================================================================
-- 076_auth_seed_accounting_editlog_read_permission.sql
-- Phase 7 sweep. AccountingService added auditor-facing edit-log read endpoints
-- guarded by [RequiresPermission("accounting.editlog.read")] (the FY edit-log
-- export over accounting.edit_log from migration 071). auth.permission has no row
-- named 'accounting.editlog.read', so PermissionBehavior (resolves by NAME) lets
-- only the wildcard SUPER_ADMIN through; every other role 403s on the auditor
-- edit-log endpoints.
--
-- This migration (pattern: 070 / 074):
--   (1) Seeds 'accounting.editlog.read' (resource='accounting',
--       action='editlog.read'), matching the live accounting.* naming convention
--       (resource = first dot-segment; action = remainder). Idempotent via
--       ON CONFLICT (name) DO NOTHING.
--   (2) Backfills resource_type_id from auth.resource_type by key='accounting'
--       (matches 044/070). action_type_id left NULL — no action_type with key
--       'editlog.read' exists and we do not invent one (consistent with 070/074).
--   (3) Grants by mirroring the live audience of 'accounting.journal.review' —
--       the closest existing accounting READ/INSPECTION audience (the review
--       permission, which also includes REVIEWER). Resolved by JOIN on live
--       grants — NOT hardcoded — so it self-adjusts and stays idempotent.
--
-- AUDIENCE (informational): on the live DB 'accounting.journal.review' is held by
-- accounts_clerk, CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN — so the auditor edit-log
-- read reaches the same audience (incl. the non-admin accounts_clerk + REVIEWER).
-- If the auditor edit-log should be restricted to a narrower set (e.g. CA / auditor
-- only) or widened, that is a separate RBAC decision and a follow-up grant.
--
-- ADDITIVE / data-only. No column or table is altered. Re-runnable.
-- Depends on: 036_auth_rbac_permission_catalog_seed.sql,
--             044_auth_resource_action_types.sql,
--             071_accounting_mca_edit_log.sql (the edit_log this guards).
-- =============================================================================

-- (1) Seed the permission row.
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT gen_random_uuid(), p.name,
       split_part(p.name, '.', 1),                          -- 'accounting'
       substring(p.name FROM position('.' IN p.name) + 1),  -- 'editlog.read'
       p.description
FROM (VALUES
    ('accounting.editlog.read',
     'Read the statutory books-of-account edit log (MCA auditor export)')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- (2) Backfill resource_type_id (key='accounting'). action_type_id intentionally NULL.
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name = 'accounting.editlog.read'
  AND  rt.key = p.resource          -- 'accounting'
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- (3) Grant by mirroring accounting.journal.review's live audience (closest
--     accounting read/inspection audience). Self-adjusting via join, idempotent.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), src.role_id, tgt.id
FROM (
    SELECT rp.role_id
    FROM   auth.role_permission rp
    JOIN   auth.permission ep ON ep.id = rp.permission_id
    WHERE  ep.name = 'accounting.journal.review'
      AND  rp.deleted_at IS NULL
      AND  COALESCE(rp.is_allowed, TRUE) = TRUE
) AS src
JOIN auth.permission tgt ON tgt.name = 'accounting.editlog.read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 076_auth_seed_accounting_editlog_read_permission.sql
-- =============================================================================
