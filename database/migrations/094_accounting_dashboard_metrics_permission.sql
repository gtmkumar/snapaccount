-- =============================================================================
-- 094_accounting_dashboard_metrics_permission.sql
-- DG-DASH-01: Seeds the 'accounting.reports.read' permission required by
-- GET /accounting/dashboard-metrics and GET /accounting/recent-activities.
--
-- These endpoints are guarded by [RequiresPermission("accounting.reports.read")]
-- in GetDashboardMetricsQuery and GetRecentActivitiesQuery.  Without a seeded
-- row in auth.permission, PermissionBehavior (which resolves by NAME) falls back
-- to SUPER_ADMIN only, so org members see 403 on the mobile Home screen.
--
-- Pattern mirrors 076_auth_seed_accounting_editlog_read_permission.sql:
--   (1) Seed the permission row — idempotent via ON CONFLICT DO NOTHING.
--   (2) Backfill resource_type_id from auth.resource_type where key='accounting'.
--   (3) Grant by mirroring 'accounting.journal.review' audience (accounts_clerk,
--       CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN) — the broadest accounting-read
--       audience already on the live DB.  Self-adjusting via JOIN, idempotent.
--
-- ADDITIVE / data-only — no column or table altered. Re-runnable.
-- Depends on: 036_auth_rbac_permission_catalog_seed.sql,
--             044_auth_resource_action_types.sql.
-- =============================================================================

-- (1) Seed permission row.
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT gen_random_uuid(), p.name,
       split_part(p.name, '.', 1),                          -- 'accounting'
       substring(p.name FROM position('.' IN p.name) + 1),  -- 'reports.read'
       p.description
FROM (VALUES
    ('accounting.reports.read',
     'Read accounting financial reports, dashboard KPIs and recent-activity feed')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- (2) Backfill resource_type_id (key='accounting'). action_type_id intentionally NULL.
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name  = 'accounting.reports.read'
  AND  rt.key  = p.resource      -- 'accounting'
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- (3) Grant by mirroring the live audience of 'accounting.journal.review':
--     accounts_clerk, CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN.
--     Any org member with a standard accounting role can view the dashboard.
--     Self-adjusting via JOIN — no hardcoded role IDs.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), src.role_id, tgt.id
FROM (
    SELECT rp.role_id
    FROM   auth.role_permission rp
    JOIN   auth.permission ep ON ep.id = rp.permission_id
    WHERE  ep.name        = 'accounting.journal.review'
      AND  rp.deleted_at  IS NULL
      AND  COALESCE(rp.is_allowed, TRUE) = TRUE
) AS src
JOIN auth.permission tgt ON tgt.name = 'accounting.reports.read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 094_accounting_dashboard_metrics_permission.sql
-- =============================================================================
