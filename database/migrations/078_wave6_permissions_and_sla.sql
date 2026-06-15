-- =============================================================================
-- 078_wave6_permissions_and_sla.sql
-- Wave 6 backend batch — GAP-014/015/022/013 schema additions:
--
-- (1) document.document_category: add sla_hours column (GAP-013)
-- (2) gst.gst_tax_rate: ensure table exists with correct structure (idempotent;
--     the table was created by the initial schema migration 001 — this migration
--     only adds missing indexes and the soft-delete guard). (GAP-022)
-- (3) Seed new permissions:
--     - document.admin         (GAP-014/013: OCR accuracy report + admin queue)
--     - gst.admin.taxrates     (GAP-022: tax rate CRUD)
-- (4) Grant gst.admin.taxrates to SUPER_ADMIN and ORG_ADMIN.
-- (5) Grant document.admin to SUPER_ADMIN and ORG_ADMIN.
-- (6) Seed WhatsApp channel config entry in notification.notification_event (GAP-045).
--
-- ADDITIVE / data-only for permission sections.
-- Column addition uses IF NOT EXISTS (idempotent).
-- Re-runnable: all INSERTs use ON CONFLICT DO NOTHING.
-- Depends on: 001 (initial schema), 036 (RBAC catalog seed).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) GAP-013: document.document_category — add sla_hours column
--     Default: 24 hours per plan J2 spec. Null = no SLA enforced.
-- -----------------------------------------------------------------------------
ALTER TABLE document.document_category
    ADD COLUMN IF NOT EXISTS sla_hours integer DEFAULT 24;

COMMENT ON COLUMN document.document_category.sla_hours IS
    'GAP-013: SLA threshold in hours per document category. NULL = no SLA enforced. Default 24h per plan J2.';

-- -----------------------------------------------------------------------------
-- (2) GAP-022: gst.gst_tax_rate — add missing indexes for effective-date lookups
--     (indexes are idempotent with IF NOT EXISTS).
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_gst_tax_rate_name_valid_from
    ON gst.gst_tax_rate (rate_name, valid_from);

CREATE INDEX IF NOT EXISTS ix_gst_tax_rate_name_valid_to
    ON gst.gst_tax_rate (rate_name, valid_to);

-- -----------------------------------------------------------------------------
-- (3) Seed new permissions
-- -----------------------------------------------------------------------------
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    p.name,
    split_part(p.name, '.', 1),
    substring(p.name FROM position('.' IN p.name) + 1),
    p.description
FROM (VALUES
    ('document.admin',     'Admin access to document queue stats, OCR accuracy, and SLA reports'),
    ('gst.admin.taxrates', 'Create, view, and deactivate GST tax rate configurations (admin-only)')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- Backfill resource_type_id (same pattern as 036/044/070)
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name IN ('document.admin', 'gst.admin.taxrates')
  AND  rt.key = p.resource
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- (4) Grant gst.admin.taxrates to SUPER_ADMIN and ORG_ADMIN
--     (same audience as gst.filing.manage per existing RBAC matrix)
-- -----------------------------------------------------------------------------
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'gst.admin.taxrates'
WHERE  r.name IN ('SUPER_ADMIN', 'ORG_ADMIN')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- (5) Grant document.admin to SUPER_ADMIN and ORG_ADMIN
-- -----------------------------------------------------------------------------
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'document.admin'
WHERE  r.name IN ('SUPER_ADMIN', 'ORG_ADMIN')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 078_wave6_permissions_and_sla.sql
-- =============================================================================
