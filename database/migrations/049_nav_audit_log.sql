-- Migration 049: Audit Log navigation entry
-- -----------------------------------------------------------------------------
-- Adds the data-driven sidebar entry for the platform Audit Log viewer
-- (GET /auth/admin/audit-events, page /admin/audit-log). The admin sidebar
-- renders the backend menu (auth.navigation_item) when present and ignores the
-- static fallback, so the item must exist here to appear. Gated by the existing
-- admin.dashboard.read permission (same gate the endpoint enforces).
--
-- Additive + idempotent (ON CONFLICT DO NOTHING). Mirrors migration 042.
-- -----------------------------------------------------------------------------

-- 1. Menu item — order 175, between Organisations (170) and Permission Catalog (180).
INSERT INTO auth.navigation_item (id, key, label, icon_key, url, display_order)
SELECT gen_random_uuid(), v.key, v.label, v.icon_key, v.url, v.display_order
FROM (VALUES
    ('admin.audit_log', 'Audit Log', 'ClipboardList', '/admin/audit-log', 175)
) AS v(key, label, icon_key, url, display_order)
ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;

-- 2. Reveal only to holders of admin.dashboard.read (reuses the existing perm).
INSERT INTO auth.menu_permission (id, menu_id, permission_id)
SELECT gen_random_uuid(), n.id, p.id
FROM (VALUES
    ('admin.audit_log', 'admin.dashboard.read')
) AS m(menu_key, perm_name)
JOIN auth.navigation_item n ON n.key = m.menu_key AND n.deleted_at IS NULL
JOIN auth.permission p      ON p.name = m.perm_name AND p.deleted_at IS NULL
ON CONFLICT (menu_id, permission_id) WHERE deleted_at IS NULL DO NOTHING;
