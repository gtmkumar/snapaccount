-- =============================================================================
-- 070_auth_seed_loan_products_read_permission.sql
-- Phase 7 sweep. Backend added GET /loans/products guarded by
--   [RequiresPermission("loan.products.read")]
-- but auth.permission has no row named 'loan.products.read'. The PermissionBehavior
-- resolves the requirement by permission NAME, so only the wildcard SUPER_ADMIN
-- passes; every other role 403s on the mobile loan hub's product list.
--
-- This migration:
--   (1) Seeds the 'loan.products.read' permission into auth.permission
--       (idempotent via ON CONFLICT (name)). resource/action follow the existing
--       loan.* convention: resource = first dot-segment ('loan'),
--       action = remainder ('products.read'). Mirrors the 036 catalog-seed style.
--   (2) Backfills resource_type_id from auth.resource_type by key (matches 044's
--       backfill logic). action_type_id is left NULL: no action_type with key
--       'products.read' exists, and we do not invent one here (consistent with
--       the nullable / ON DELETE SET NULL design; backend may add the action_type
--       later if the type catalog is extended).
--   (3) Grants 'loan.products.read' to exactly the roles that already hold
--       'loan.eligibility.check' (the same loan-read audience), discovered by
--       join — NOT hardcoded — so the grant self-adjusts to the live data and
--       stays idempotent.
--
-- AUDIENCE NOTE (flagged for orchestrator / RBAC owner — NOT widened here):
-- 'loan.eligibility.check' is currently held only by ORG_ADMIN and SUPER_ADMIN.
-- Mirroring it therefore grants 'loan.products.read' to those two roles only. If
-- the product intent is that customer/staff-tier roles (e.g. BUSINESS_OWNER,
-- ORG_MEMBER, EMPLOYEE) should also see the loan-product hub, that is a separate
-- RBAC decision and a follow-up grant — this migration deliberately does not
-- broaden the audience beyond the explicit "mirror eligibility.check" scope.
--
-- ADDITIVE / data-only. No column or table is altered. Re-runnable: the
-- permission INSERT uses ON CONFLICT (name) DO NOTHING; the grant uses
-- ON CONFLICT (role_id, permission_id) DO NOTHING; the backfill UPDATE is guarded
-- by IS NULL. Verified by a second back-to-back apply under ON_ERROR_STOP=1.
--
-- Fresh-DB note: the permission catalog and default grants are seeded ONLY by
-- migrations (036 + this file); database/dev-seed/* does not seed auth.permission
-- or auth.role_permission, so no dev-seed file needs editing — fresh DBs get this
-- row by replaying the migration chain.
--
-- Conventions: matches 036 (permission/grant seed style) and 044 (type backfill).
-- Depends on: 036_auth_rbac_permission_catalog_seed.sql, 044_auth_resource_action_types.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) Seed the permission row
-- -----------------------------------------------------------------------------
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    p.name,
    split_part(p.name, '.', 1),                          -- 'loan'
    substring(p.name FROM position('.' IN p.name) + 1),  -- 'products.read'
    p.description
FROM (VALUES
    ('loan.products.read', 'View available loan products (loan product catalog)')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- (2) Backfill resource_type_id (matches 044). action_type_id intentionally NULL.
-- -----------------------------------------------------------------------------
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name = 'loan.products.read'
  AND  rt.key = p.resource          -- 'loan'
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- (3) Grant to every role that already holds loan.eligibility.check (mirror).
--     Resolved by join on the live grants — idempotent, self-adjusting.
-- -----------------------------------------------------------------------------
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), src.role_id, tgt.id
FROM (
    SELECT rp.role_id
    FROM   auth.role_permission rp
    JOIN   auth.permission ep ON ep.id = rp.permission_id
    WHERE  ep.name = 'loan.eligibility.check'
      AND  rp.deleted_at IS NULL
      AND  COALESCE(rp.is_allowed, TRUE) = TRUE   -- mirror only positive grants
) AS src
JOIN auth.permission tgt ON tgt.name = 'loan.products.read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 070_auth_seed_loan_products_read_permission.sql
-- =============================================================================
