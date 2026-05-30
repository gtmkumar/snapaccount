-- =============================================================================
-- 036_auth_rbac_permission_catalog_seed.sql
-- Auth/RBAC Module 1 — Permission catalog + baseline system roles + default grants.
-- ADDITIVE, idempotent seed. Depends on 001 + 035.
--
-- Scope ref: .claude/orchestrator/auth-rbac-module-scope.md (§3)
--   - New org.* / platform.* management permissions
--   - All existing service perms (gst.*, accounting.*, document.*, chat.*,
--     callback.*, itr.*, loan.*, subscription.*, notification.*, admin.*) so the
--     permission-matrix UI can render EVERY module.
--   - Baseline system roles: SUPER_ADMIN, ORG_ADMIN, CA, MANAGER, HR, REVIEWER
--   - Sensible default role_permission grants per role.
--
-- Permission naming: dot-notation `resource.action` (matches backend
-- [RequiresPermission("...")]). resource = first segment, action = remainder.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permission catalog
--    resource = split_part(name,'.',1); action = everything after first dot.
-- -----------------------------------------------------------------------------
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    p.name,
    split_part(p.name, '.', 1),
    substring(p.name FROM position('.' IN p.name) + 1),
    p.description
FROM (VALUES
    -- ── Org management (Auth/RBAC — scope §3) ─────────────────────────────────
    ('org.members.read',         'View organization members'),
    ('org.members.invite',       'Invite a member into the organization'),
    ('org.members.update',       'Update an organization member'),
    ('org.members.remove',       'Remove a member from the organization'),
    ('org.members.suspend',      'Suspend / reactivate an organization member'),
    ('org.roles.read',           'View organization roles'),
    ('org.roles.create',         'Create a custom org role'),
    ('org.roles.update',         'Update a custom org role'),
    ('org.roles.delete',         'Delete a custom org role'),
    ('org.roles.assign',         'Assign a role to a member'),
    ('org.permissions.read',     'View the permission catalog'),
    ('org.permissions.grant',    'Toggle permissions on a role (bounded by delegation rule)'),
    ('org.settings.read',        'View organization settings'),
    ('org.settings.update',      'Update organization settings'),

    -- ── Platform-only (SUPER_ADMIN) ───────────────────────────────────────────
    ('platform.orgs.read',          'View all organizations (cross-tenant)'),
    ('platform.orgs.create',        'Create / register a new organization'),
    ('platform.orgs.suspend',       'Suspend an organization'),
    ('platform.admins.invite',      'Invite an Org Admin'),
    ('platform.roles.manage',       'Manage global/system roles'),
    ('platform.permissions.manage', 'Manage the global permission catalog'),

    -- ── Existing service permissions (backend-enforced; for full matrix) ───────
    -- accounting
    ('accounting.fiscal_year.close', 'Close a fiscal year'),
    ('accounting.journal.reverse',   'Reverse a journal entry'),
    ('accounting.journal.review',    'Review a journal entry'),
    -- admin
    ('admin.dashboard.read',         'View admin dashboard'),
    ('admin.gst.queue.read',         'View the GST filing queue'),
    ('admin.users.read',             'View platform users'),
    -- callback
    ('callback.assign',              'Assign a callback'),
    ('callback.cancel',              'Cancel a callback'),
    ('callback.complete',            'Complete a callback'),
    ('callback.escalate',            'Escalate a callback'),
    -- chat
    ('chat.thread.assign',           'Assign a chat thread'),
    ('chat.thread.escalate',         'Escalate a chat thread'),
    ('chat.thread.resolve',          'Resolve a chat thread'),
    -- document
    ('document.archive',             'Archive a document'),
    ('document.read',                'View documents'),
    ('document.share',               'Share a document'),
    ('document.update',              'Update a document'),
    -- gst
    ('gst.einvoices.generate',       'Generate an e-invoice (IRN)'),
    ('gst.ewaybills.create',         'Create an e-way bill'),
    ('gst.invoices.create',          'Create a GST invoice'),
    ('gst.itc.reconcile',            'Reconcile input tax credit'),
    ('gst.notices.assign',           'Assign a GST notice'),
    ('gst.notices.create',           'Create a GST notice'),
    ('gst.notices.respond',          'Respond to a GST notice'),
    ('gst.returns.approve',          'Approve a GST return'),
    ('gst.returns.file',             'File a GST return'),
    -- itr
    ('itr.filing.read',              'View ITR filings'),
    ('itr.filings.ca_review',        'CA review of an ITR filing'),
    ('itr.filings.compute',          'Compute an ITR filing'),
    ('itr.filings.create',           'Create an ITR filing'),
    ('itr.filings.file',             'File an ITR'),
    ('itr.filings.submit',           'Submit an ITR filing'),
    ('itr.filings.verify',           'Verify an ITR filing'),
    ('itr.form16.upload',            'Upload Form 16'),
    ('itr.grievance.create',         'Create an ITR grievance'),
    ('itr.grievance.read',           'View ITR grievances'),
    ('itr.notices.create',           'Create an ITR notice'),
    ('itr.notices.respond',          'Respond to an ITR notice'),
    ('itr.profile.update',           'Update an ITR assessee profile'),
    -- loan
    ('loan.application.close',        'Close a loan application'),
    ('loan.application.consent',      'Capture loan consent'),
    ('loan.application.create',       'Create a loan application'),
    ('loan.application.submit',       'Submit a loan application'),
    ('loan.application.update',       'Update a loan application'),
    ('loan.bank.assign',              'Assign a loan to a partner bank'),
    ('loan.bank.create',              'Create a partner bank record'),
    ('loan.bank.decision',            'Record a partner bank decision'),
    ('loan.bank.update',              'Update a partner bank record'),
    ('loan.disbursement.record',      'Record a loan disbursement'),
    ('loan.eligibility.check',        'Check loan eligibility'),
    ('loan.package.generate',         'Generate a loan package'),
    -- notification
    ('notification.dlq.manage',       'Manage the notification dead-letter queue'),
    -- subscription
    ('subscription.plan.create',      'Create a subscription plan'),
    ('subscription.plan.update',      'Update a subscription plan')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Baseline system roles (organization_id NULL = system/global)
--    CA already exists from 999 — reused via ON CONFLICT.
-- -----------------------------------------------------------------------------
INSERT INTO auth.role (id, name, display_name, description, is_system_role, is_active, organization_id)
VALUES
    (gen_random_uuid(), 'SUPER_ADMIN', 'Super Administrator', 'SnapAccount platform staff. Registers org admins, manages global catalog and system roles. Cross-org visibility.', TRUE, TRUE, NULL),
    (gen_random_uuid(), 'ORG_ADMIN',   'Organization Admin',  'Owns an organization. Invites employees, creates custom roles, assigns permissions. Scoped to their org.', TRUE, TRUE, NULL),
    (gen_random_uuid(), 'CA',          'Chartered Accountant','Reviews financials, expert chat, tax computations.', TRUE, TRUE, NULL),
    (gen_random_uuid(), 'MANAGER',     'Manager',             'Manages team members, assigns roles, monitors module work.', TRUE, TRUE, NULL),
    (gen_random_uuid(), 'HR',          'HR',                  'Manages member onboarding/offboarding (invite, update, suspend).', TRUE, TRUE, NULL),
    (gen_random_uuid(), 'REVIEWER',    'Reviewer',            'Read-only + review/approve capability across modules.', TRUE, TRUE, NULL)
-- Migration 035 replaced the global UNIQUE(name) with partial unique indexes.
-- Target the system-role partial index (organization_id IS NULL) as the arbiter.
ON CONFLICT (name) WHERE organization_id IS NULL AND deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Default role_permission grants
--    All resolved via name lookups → idempotent. ON CONFLICT skips dupes.
-- -----------------------------------------------------------------------------

-- 3a. SUPER_ADMIN — every permission in the catalog.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r CROSS JOIN auth.permission p
WHERE r.name = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3b. ORG_ADMIN — all org.* + all service-module perms, NO platform.*.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'ORG_ADMIN'
  AND p.resource IN ('org','accounting','document','gst','itr','loan','chat','callback','subscription','notification')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3c. CA — professional review/compute/file across tax modules + org read.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'CA'
  AND p.name IN (
        'org.members.read','org.roles.read','org.permissions.read',
        'document.read','document.update','document.share',
        'gst.invoices.create','gst.returns.file','gst.returns.approve',
        'gst.itc.reconcile','gst.notices.respond','gst.einvoices.generate','gst.ewaybills.create',
        'accounting.journal.review','accounting.journal.reverse','accounting.fiscal_year.close',
        'itr.filing.read','itr.filings.ca_review','itr.filings.compute','itr.filings.create',
        'itr.filings.file','itr.filings.submit','itr.filings.verify','itr.form16.upload',
        'itr.notices.respond','itr.grievance.read','itr.grievance.create','itr.profile.update',
        'chat.thread.resolve','chat.thread.assign','chat.thread.escalate'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3d. MANAGER — team management + role assignment + module read + workflow ops.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'MANAGER'
  AND p.name IN (
        'org.members.read','org.members.invite','org.members.update',
        'org.members.remove','org.members.suspend',
        'org.roles.read','org.roles.assign','org.permissions.read',
        'org.settings.read',
        'document.read','itr.filing.read','itr.grievance.read',
        'admin.dashboard.read',
        'callback.assign','callback.complete','callback.escalate','callback.cancel',
        'chat.thread.assign','chat.thread.escalate','chat.thread.resolve'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3e. HR — member onboarding / offboarding.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'HR'
  AND p.name IN (
        'org.members.read','org.members.invite','org.members.update','org.members.suspend',
        'org.roles.read','org.permissions.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3f. REVIEWER — read-only + review/approve across modules.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'REVIEWER'
  AND p.name IN (
        'org.members.read','org.roles.read','org.permissions.read',
        'document.read','itr.filing.read','itr.filings.ca_review','itr.grievance.read',
        'gst.returns.approve','gst.itc.reconcile',
        'accounting.journal.review','admin.dashboard.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 036
-- =============================================================================
