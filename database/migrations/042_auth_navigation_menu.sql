-- =============================================================================
-- 042_auth_navigation_menu.sql
-- Auth/RBAC — Dynamic Navigation module (gap #1 vs the enhanced authz model).
-- Backend-driven menu: the sidebar is served from data and permission-filtered,
-- instead of being a hardcoded array in the frontend (Sidebar.tsx navItems).
-- ADDITIVE, idempotent. Safe against a running AuthService (new tables + seed).
--
-- Model:
--   auth.navigation_item  — one row per menu entry (self-ref parent for groups,
--                           icon_key → lucide name on the client, url, order).
--   auth.menu_permission  — maps a menu item to the permission(s) that reveal it.
--                           A menu with NO mapping is visible to all authenticated
--                           users (e.g. Dashboard). With mappings, the item shows
--                           when the user's effective perms intersect them (OR),
--                           and the "*" wildcard matches everything.
--
-- The seed reproduces the exact visibility of the legacy hardcoded sidebar:
-- each item is mapped to either an EXISTING management permission (settings/roles,
-- organizations, permission catalog, reference data) or a new menu.<key>.view
-- permission granted to the same roles that saw the item before.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.navigation_item (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key            VARCHAR(100) NOT NULL,                 -- stable identifier (e.g. 'gst', 'loans.partner_banks')
    parent_id      UUID REFERENCES auth.navigation_item (id) ON DELETE CASCADE,
    label          VARCHAR(200) NOT NULL,                 -- English fallback; client prefers i18n key nav.<key>
    icon_key       VARCHAR(100),                          -- lucide-react icon name, mapped on the client
    url            VARCHAR(300) NOT NULL,
    display_order  INT NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    created_by     UUID,
    updated_by     UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_navigation_item_key
    ON auth.navigation_item (key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_navigation_item_parent ON auth.navigation_item (parent_id);
CREATE INDEX IF NOT EXISTS idx_navigation_item_order  ON auth.navigation_item (display_order);

CREATE TABLE IF NOT EXISTS auth.menu_permission (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id        UUID NOT NULL REFERENCES auth.navigation_item (id) ON DELETE CASCADE,
    permission_id  UUID NOT NULL REFERENCES auth.permission (id) ON DELETE CASCADE,
    is_required    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    created_by     UUID,
    updated_by     UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_permission
    ON auth.menu_permission (menu_id, permission_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menu_permission_menu ON auth.menu_permission (menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_permission_perm ON auth.menu_permission (permission_id);

DROP TRIGGER IF EXISTS trg_navigation_item_updated_at ON auth.navigation_item;
CREATE TRIGGER trg_navigation_item_updated_at
    BEFORE UPDATE ON auth.navigation_item
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

DROP TRIGGER IF EXISTS trg_menu_permission_updated_at ON auth.menu_permission;
CREATE TRIGGER trg_menu_permission_updated_at
    BEFORE UPDATE ON auth.menu_permission
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. New menu-view permissions (resource = 'menu', action = '<key>.view')
-- -----------------------------------------------------------------------------
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT gen_random_uuid(), p.name, 'menu',
       substring(p.name FROM position('.' IN p.name) + 1), p.description
FROM (VALUES
    ('menu.documents.view',            'See the Documents menu'),
    ('menu.gst.view',                  'See the GST menu'),
    ('menu.gst_notices.view',          'See the GST Notices menu'),
    ('menu.itr.view',                  'See the ITR menu'),
    ('menu.loans.view',                'See the Loans menu'),
    ('menu.loans.bank_comms.view',     'See the Bank Communications menu'),
    ('menu.loans.partner_banks.view',  'See the Partner Banks menu'),
    ('menu.chat.view',                 'See the Chat menu'),
    ('menu.users.view',                'See the Users menu'),
    ('menu.team.view',                 'See the Team menu'),
    ('menu.subscriptions.view',        'See the Subscriptions menu'),
    ('menu.reports.view',              'See the Reports menu'),
    ('menu.callbacks.view',            'See the Callbacks menu'),
    ('menu.settings.view',             'See the Settings menu')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Navigation items (flat; mirrors legacy Sidebar order). parent_id reserved
--    for future grouping. icon_key = lucide-react component name.
-- -----------------------------------------------------------------------------
INSERT INTO auth.navigation_item (id, key, label, icon_key, url, display_order)
SELECT gen_random_uuid(), v.key, v.label, v.icon_key, v.url, v.display_order
FROM (VALUES
    ('dashboard',              'Dashboard',           'LayoutDashboard',  '/dashboard',                 10),
    ('documents',              'Documents',           'FileText',         '/documents',                 20),
    ('gst',                    'GST',                 'Receipt',          '/gst',                       30),
    ('gst_notices',            'GST Notices',         'Receipt',          '/gst/notices',               40),
    ('itr',                    'ITR',                 'FileSpreadsheet',  '/itr',                       50),
    ('loans',                  'Loans',               'CreditCard',       '/loans',                     60),
    ('loans.bank_comms',       'Bank Comms',          'CreditCard',       '/loans/bank-communications', 70),
    ('loans.partner_banks',    'Partner Banks',       'CreditCard',       '/loans/partner-banks',       80),
    ('chat',                   'Chat',                'MessageSquare',    '/chat',                      90),
    ('users',                  'Users',               'Users',            '/users',                    100),
    ('team',                   'Team',                'Users2',           '/team',                     110),
    ('subscriptions',          'Subscriptions',       'Building2',        '/subscriptions',            120),
    ('reports',                'Reports',             'BarChart3',        '/reports',                  130),
    ('callbacks',              'Callbacks',           'PhoneCall',        '/callbacks',                140),
    ('settings',               'Settings',            'Settings',         '/settings',                 150),
    ('settings.roles',         'Roles & Permissions', 'Shield',           '/settings/roles',           160),
    ('admin.organizations',    'Organisations',       'Globe',            '/admin/organizations',      170),
    ('settings.permissions',   'Permission Catalog',  'ListChecks',       '/settings/permissions',     180),
    ('settings.reference_data','Reference Data',      'Database',         '/settings/reference-data',  190)
) AS v(key, label, icon_key, url, display_order)
ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Map menu items → permission(s). Dashboard has NO mapping (public to all
--    authenticated users). The four admin items reuse EXISTING management perms;
--    the rest use the menu.<key>.view perms seeded above.
-- -----------------------------------------------------------------------------
INSERT INTO auth.menu_permission (id, menu_id, permission_id)
SELECT gen_random_uuid(), n.id, p.id
FROM (VALUES
    ('documents',              'menu.documents.view'),
    ('gst',                    'menu.gst.view'),
    ('gst_notices',            'menu.gst_notices.view'),
    ('itr',                    'menu.itr.view'),
    ('loans',                  'menu.loans.view'),
    ('loans.bank_comms',       'menu.loans.bank_comms.view'),
    ('loans.partner_banks',    'menu.loans.partner_banks.view'),
    ('chat',                   'menu.chat.view'),
    ('users',                  'menu.users.view'),
    ('team',                   'menu.team.view'),
    ('subscriptions',          'menu.subscriptions.view'),
    ('reports',                'menu.reports.view'),
    ('callbacks',              'menu.callbacks.view'),
    ('settings',               'menu.settings.view'),
    -- Reuse existing management permissions (same gate as before):
    ('settings.roles',         'org.roles.read'),
    ('admin.organizations',    'platform.orgs.read'),
    ('settings.permissions',   'platform.permissions.manage'),
    ('settings.reference_data','platform.refdata.manage')
) AS m(menu_key, perm_name)
JOIN auth.navigation_item n ON n.key = m.menu_key AND n.deleted_at IS NULL
JOIN auth.permission p      ON p.name = m.perm_name AND p.deleted_at IS NULL
-- uq_menu_permission is a partial index (WHERE deleted_at IS NULL); the arbiter
-- must restate that predicate to match it.
ON CONFLICT (menu_id, permission_id) WHERE deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Grant the menu.* perms to roles, reproducing legacy requiredRoles exactly.
--    SUPER_ADMIN gets every menu.* (it also holds "*"); other roles per the list.
-- -----------------------------------------------------------------------------
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON p.resource = 'menu'
WHERE r.name = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'OPERATIONS_MANAGER'
  AND p.name IN (
      'menu.documents.view','menu.gst.view','menu.gst_notices.view','menu.itr.view',
      'menu.loans.view','menu.loans.bank_comms.view','menu.chat.view','menu.users.view',
      'menu.team.view','menu.subscriptions.view','menu.reports.view','menu.callbacks.view',
      'menu.settings.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'CA'
  AND p.name IN (
      'menu.documents.view','menu.gst.view','menu.gst_notices.view','menu.itr.view',
      'menu.loans.view','menu.chat.view','menu.reports.view','menu.callbacks.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'SUPPORT_EXECUTIVE'
  AND p.name IN (
      'menu.gst.view','menu.gst_notices.view','menu.itr.view','menu.loans.view',
      'menu.chat.view','menu.users.view','menu.callbacks.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'DATA_ENTRY_OPERATOR'
  AND p.name IN ('menu.documents.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'PARTNER_BANK_REP'
  AND p.name IN ('menu.loans.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 042
-- =============================================================================
