-- 041: Unify the platform super-admin role onto the canonical SUPER_ADMIN (migration 036).
--
-- Background: the platform super-admin existed under TWO names — SUPER_ADMIN (036, the
-- canonical org-RBAC catalog) and the legacy SYSTEM_ADMIN (999 seed / LocalAuthService).
-- We standardise on SUPER_ADMIN. This migration repoints any active SYSTEM_ADMIN role
-- assignments to SUPER_ADMIN (de-duplicating) and retires the SYSTEM_ADMIN role.
--
-- Idempotent: once the SYSTEM_ADMIN role is gone, re-running is a no-op.
-- Two-families note: the SnapAccount internal-staff operational roles (OPERATIONS_MANAGER,
-- SUPPORT_EXECUTIVE, DATA_ENTRY_OPERATOR, PARTNER_BANK_REP, CA) are intentionally retained.

DO $$
DECLARE
  super_id uuid;
BEGIN
  SELECT id INTO super_id
    FROM auth.role
   WHERE name = 'SUPER_ADMIN' AND organization_id IS NULL AND deleted_at IS NULL
   ORDER BY created_at
   LIMIT 1;

  IF super_id IS NULL THEN
    RAISE NOTICE '041: SUPER_ADMIN role not found — skipping (036 seed not applied?).';
    RETURN;
  END IF;

  -- Drop SYSTEM_ADMIN assignments for users who ALREADY hold SUPER_ADMIN (avoid unique clash).
  DELETE FROM auth.user_role ur
   USING auth.role r
   WHERE ur.role_id = r.id
     AND r.name = 'SYSTEM_ADMIN'
     AND EXISTS (SELECT 1 FROM auth.user_role u2
                  WHERE u2.user_id = ur.user_id AND u2.role_id = super_id);

  -- Repoint the remaining SYSTEM_ADMIN assignments → SUPER_ADMIN.
  UPDATE auth.user_role ur
     SET role_id = super_id
    FROM auth.role r
   WHERE ur.role_id = r.id AND r.name = 'SYSTEM_ADMIN';

  -- Retire the legacy SYSTEM_ADMIN role(s).
  UPDATE auth.role
     SET deleted_at = now(), is_active = false
   WHERE name = 'SYSTEM_ADMIN' AND deleted_at IS NULL;
END $$;
