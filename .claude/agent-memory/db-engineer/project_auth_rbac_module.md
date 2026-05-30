---
name: auth-rbac-module-conventions
description: Non-obvious conventions for the auth schema RBAC / multi-tenant model (migrations 035-036)
metadata:
  type: project
---

The auth/RBAC multi-tenant model (migrations 035 + 036) has conventions that are NOT obvious from a casual read of the schema.

**Role-name uniqueness.** Migration 035 DROPPED the original global `UNIQUE(name)` on `auth.role` and replaced it with two PARTIAL unique indexes: `uq_role_system_name` (`name WHERE organization_id IS NULL AND deleted_at IS NULL`) and `uq_role_org_name` (`(organization_id,name) WHERE organization_id IS NOT NULL AND deleted_at IS NULL`).
**Why:** globally-unique role names break multi-tenancy — org A and org B must both be able to create a "Manager"/"HR" role.
**How to apply:** any `INSERT ... ON CONFLICT (name)` on `auth.role` for a SYSTEM role must target the partial arbiter `ON CONFLICT (name) WHERE organization_id IS NULL AND deleted_at IS NULL` — a bare `ON CONFLICT (name)` will error with "no unique or exclusion constraint matching". Custom (org) roles are NULL-able org-scoped: `organization_id` NULL = system/global role.

**Permission naming.** `auth.permission.name` is dot-notation `resource.action` (e.g. `org.members.read`, `gst.returns.file`) matching backend `[RequiresPermission("...")]` literals exactly. `resource` = first dot-segment, `action` = remainder. (The original 001 comment showed colon-format `gst:return:file` but NO permissions were ever seeded there — 036 is the first/authoritative catalog seed.)

**RLS session vars.** auth-schema RLS policies read `current_setting('app.current_user_id', TRUE)::UUID`. Module-1 policies (`role_org_isolation`, `invitation_org_isolation`) add a platform-admin bypass `current_setting('app.is_platform_admin', TRUE) = 'true'` for SUPER_ADMIN cross-org reads. RLS is defense-in-depth only — the constrained-delegation / no-privilege-escalation rule is enforced in the backend application layer, not RLS.
