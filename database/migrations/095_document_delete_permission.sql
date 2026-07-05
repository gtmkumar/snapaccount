-- =============================================================================
-- 095_document_delete_permission.sql
-- DG-DOC-01: Add document.delete permission and grant it to SUPER_ADMIN,
--            ORG_ADMIN, and ORG_MEMBER roles so that the new
--            DELETE /documents/{id} soft-delete endpoint is accessible.
--
-- ADDITIVE / data-only. Re-runnable: all INSERTs use ON CONFLICT DO NOTHING.
-- Depends on: 036 (RBAC catalog seed), 059 (org member role seed).
-- =============================================================================

-- ── 1. Add the permission entry ─────────────────────────────────────────────
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    'document.delete',
    'document',
    'delete',
    'Soft-delete an owned document (DG-DOC-01: DELETE /documents/{id})'
ON CONFLICT (name) DO NOTHING;

-- ── 2. Backfill resource_type_id (same pattern as 036/078) ──────────────────
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name = 'document.delete'
  AND  rt.key = 'document'
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- ── 3. Grant to SUPER_ADMIN, ORG_ADMIN, and ORG_MEMBER ──────────────────────
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'document.delete'
WHERE  r.name IN ('SUPER_ADMIN', 'ORG_ADMIN', 'ORG_MEMBER')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 095_document_delete_permission.sql
-- =============================================================================
