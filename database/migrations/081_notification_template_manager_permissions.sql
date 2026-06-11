-- =============================================================================
-- 081_notification_template_manager_permissions.sql
-- Wave 7A — GAP-037: Notification Template Manager
--
-- The NotificationTemplate entity and notification.notification_template table
-- were created by the initial schema migrations (008 + 017). This migration:
--
--   1. Adds columns missing from the original schema that the GAP-037 CRUD
--      endpoints need (created_by / updated_by as UUID — NOT TEXT, matching
--      BaseDbContext.GuidStringConverter; effective versioning fields are already
--      present from migration 008).
--
--   2. Seeds the notification.templates.manage permission.
--
--   3. Grants notification.templates.manage to SUPER_ADMIN only (admin-only
--      per GAP-037 requirement — operators manage templates without code deployments).
--
-- NOTE: The entity already maps to notification.notification_template (verified
-- against NotificationTemplateConfiguration.cs). No table CREATE needed.
-- All column additions use ADD COLUMN IF NOT EXISTS (idempotent).
--
-- Depends on: 015_medium_priority_services.sql (notification schema),
--             036_auth_rbac_permission_catalog_seed.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ensure created_by / updated_by are UUID type (NOT TEXT) to match
--    BaseDbContext GuidStringConverter behaviour.
--    The original schema 015 may have created these as TEXT or absent.
--    Add them as UUID if not present.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Add created_by UUID column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'notification'
          AND table_name   = 'notification_template'
          AND column_name  = 'created_by'
    ) THEN
        ALTER TABLE notification.notification_template
            ADD COLUMN created_by UUID;
        COMMENT ON COLUMN notification.notification_template.created_by IS
            'UUID of the user who created this template (BaseDbContext audit).';
    END IF;

    -- Add updated_by UUID column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'notification'
          AND table_name   = 'notification_template'
          AND column_name  = 'updated_by'
    ) THEN
        ALTER TABLE notification.notification_template
            ADD COLUMN updated_by UUID;
        COMMENT ON COLUMN notification.notification_template.updated_by IS
            'UUID of the user who last updated this template (BaseDbContext audit).';
    END IF;

    -- Ensure deleted_at is present (soft-delete)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'notification'
          AND table_name   = 'notification_template'
          AND column_name  = 'deleted_at'
    ) THEN
        ALTER TABLE notification.notification_template
            ADD COLUMN deleted_at TIMESTAMPTZ;
        COMMENT ON COLUMN notification.notification_template.deleted_at IS
            'Soft-delete timestamp (NULL = active).';
    END IF;
END $$;

-- Backfill NULL effective_from values — the EF entity maps this as non-nullable DateOnly.
-- Pre-existing seeded rows from schema migrations 008/015 may have NULL; set default FY start.
UPDATE notification.notification_template
SET    effective_from = '2024-04-01'
WHERE  effective_from IS NULL;

-- Add missing index on event_type + channel + language for dispatch lookup performance
CREATE INDEX IF NOT EXISTS ix_notification_template_event_channel_locale
    ON notification.notification_template (event_type, channel, language)
    WHERE deleted_at IS NULL AND is_current = TRUE;

-- set_updated_at trigger (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_updated_at_notification_template'
          AND tgrelid = 'notification.notification_template'::regclass
    ) THEN
        CREATE TRIGGER set_updated_at_notification_template
            BEFORE UPDATE ON notification.notification_template
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
EXCEPTION WHEN undefined_table THEN
    -- notification_template doesn't exist yet — skip (initial schema not applied)
    NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Seed notification.templates.manage permission
-- -----------------------------------------------------------------------------
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    p.name,
    split_part(p.name, '.', 1),
    substring(p.name FROM position('.' IN p.name) + 1),
    p.description
FROM (VALUES
    ('notification.templates.manage',
     'CRUD and test-send for notification templates (admin-only; enables zero-deploy copy changes)')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- Backfill resource_type_id (matches 036/044/070/074 pattern)
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name = 'notification.templates.manage'
  AND  rt.key = p.resource
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Grant notification.templates.manage to SUPER_ADMIN only
--    (Ops/admin-only feature — not exposed to ORG_ADMIN or ORG_MEMBER)
-- -----------------------------------------------------------------------------
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'notification.templates.manage'
WHERE  r.name IN ('SUPER_ADMIN')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
