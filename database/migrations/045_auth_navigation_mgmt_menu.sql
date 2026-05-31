-- =============================================================================
-- 045_auth_navigation_mgmt_menu.sql
-- Adds the "Navigation" admin screen to the data-driven sidebar (Menu Management).
-- The menu-management page needs its own menu entry; gate it behind the same
-- platform.permissions.manage perm that the CRUD endpoints require (SUPER_ADMIN).
-- ADDITIVE, idempotent.
-- =============================================================================

INSERT INTO auth.navigation_item (id, key, label, icon_key, url, display_order)
VALUES (gen_random_uuid(), 'settings.navigation', 'Navigation', 'ListTree', '/settings/navigation', 185)
ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO auth.menu_permission (id, menu_id, permission_id)
SELECT gen_random_uuid(), n.id, p.id
FROM auth.navigation_item n
JOIN auth.permission p ON p.name = 'platform.permissions.manage' AND p.deleted_at IS NULL
WHERE n.key = 'settings.navigation' AND n.deleted_at IS NULL
ON CONFLICT (menu_id, permission_id) WHERE deleted_at IS NULL DO NOTHING;

-- =============================================================================
-- End 045
-- =============================================================================
