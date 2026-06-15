---
name: conventions-rbac-permission-seed
description: How to seed a new auth.permission row for a [RequiresPermission] guard and grant it idempotently by mirroring an existing permission's audience
metadata:
  type: feedback
---

When backend adds an endpoint guarded by `[RequiresPermission("x.y.z")]`, a matching row MUST exist in `auth.permission` or every non-wildcard role 403s. `PermissionBehavior` resolves by permission **name**, so `name` is the load-bearing field; `resource`/`action` are derived/secondary.

**Seed convention (copy migration 036):**
- `name` = the exact `[RequiresPermission]` string.
- `resource` = `split_part(name,'.',1)` (FIRST dot-segment only, e.g. `loan`).
- `action` = `substring(name FROM position('.' IN name)+1)` (everything after first dot, e.g. `products.read`). NOTE: this means multi-segment actions are normal; do NOT make resource the first two segments.
- INSERT ... `ON CONFLICT (name) DO NOTHING` (auth.permission has UNIQUE on name).

**Type-id backfill (copy migration 044):** `UPDATE ... SET resource_type_id = rt.id FROM auth.resource_type rt WHERE rt.key = p.resource AND p.resource_type_id IS NULL`. Leave `action_type_id` NULL if no `action_type` with that key exists — both type columns are nullable / `ON DELETE SET NULL`; don't invent an action_type.

**Granting — prefer the mirror pattern over hardcoded role names:** to give the new permission the same audience as an existing one, INSERT into `auth.role_permission` selecting `role_id` from the roles that already hold the reference permission (join, filter `deleted_at IS NULL AND COALESCE(is_allowed,TRUE)=TRUE`), `ON CONFLICT (role_id, permission_id) DO NOTHING`. Self-adjusting + idempotent.

**Why:** mirror-by-join survives role-id changes across DBs and stays idempotent; hardcoded UUIDs/names drift. Verify audience parity with a both-ways `EXCEPT` between the two permissions' grant sets (should be empty).

**Watch-out:** "mirror permission P" may grant a NARROWER audience than the product intent implies. E.g. `loan.eligibility.check` was held only by ORG_ADMIN + SUPER_ADMIN, so mirroring it did NOT reach customer/staff roles. Follow the explicit instruction, apply the grant, but FLAG the gap to the orchestrator rather than silently widening — widening the audience is an RBAC product decision, not a DB call.

**Fresh-DB seeding:** the permission catalog + default grants live ONLY in migrations (036 + later seed migrations); `database/dev-seed/*` does NOT seed auth.permission/auth.role_permission. So a new permission belongs in a numbered migration (replays on fresh DBs), not a dev-seed file. See [[conventions_migrations_ef_parity]].
