-- =============================================================================
-- 046_grant_data_entry_operator_document_perms.sql
-- -----------------------------------------------------------------------------
-- Action-level RBAC (Option 2): provision DATA_ENTRY_OPERATOR with its real
-- operational document permissions so a genuine data-entry operator can work the
-- Document Queue (Review/Assign), while a deliberately-stripped user (only
-- menu.documents.view) cannot. The in-page actions are gated client-side by these
-- same permission codes via the <Can> component.
--
-- Mapping (admin Document Queue):
--   Review / Export -> document.read
--   Assign          -> document.update
--
-- Idempotent: resolved by name lookups; ON CONFLICT skips dupes.
-- =============================================================================

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r
JOIN auth.permission p ON TRUE
WHERE r.name = 'DATA_ENTRY_OPERATOR'
  AND p.name IN ('document.read', 'document.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;
