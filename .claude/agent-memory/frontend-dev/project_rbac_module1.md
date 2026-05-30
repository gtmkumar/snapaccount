---
name: rbac-module1-completion
description: Auth/RBAC Module 1 deliverables — pages built, routes, patterns, delegation rule UI
metadata:
  type: project
---

Auth/RBAC Module 1 completed 2026-05-29. All deliverables under src/admin/.

**Pages built:**
- `src/admin/src/pages/roles/RolesPermissionsPage.tsx` → route `/settings/roles` (gated org.roles.read)
- `src/admin/src/pages/orgs/OrganizationsPage.tsx` → route `/admin/organizations` (SUPER_ADMIN, gated platform.orgs.read)
- `src/admin/src/pages/orgs/OrganizationDetailPage.tsx` → route `/admin/organizations/:orgId`
- `src/admin/src/pages/auth/InviteAcceptancePage.tsx` → route `/invite/:token` (PUBLIC, no auth required)
- `src/admin/src/pages/team/TeamPage.tsx` — existing page wired to real org endpoints (routes already matched)

**New API client:** `src/admin/src/lib/rbacApi.ts`
Covers: listOrgRoles, getOrgRole, createOrgRole, updateOrgRole, deleteOrgRole, getRolePermissions, setRolePermissions, listPermissions, getGrantablePermissions, listOrganizations, createOrganization, suspendOrganization, validateInviteToken, acceptInvite.

**Updated files:**
- `src/admin/src/lib/teamApi.ts` — existing endpoints confirmed correct per backend contract
- `src/admin/src/hooks/usePermission.ts` — added hasServerPermission / hasAnyServerPermission / hasAllServerPermissions using TanStack Query + /auth/me/permissions
- `src/admin/src/components/layout/Sidebar.tsx` — added Shield + Globe icons; permission-gated nav for /settings/roles and /admin/organizations via requiredServerPermission field
- `src/admin/src/router.tsx` — added 4 new routes

**Delegation rule UI pattern:**
- Matrix reads grantablePermissionIds from GET /auth/me/grantable-permissions
- Toggle disabled when permissionId NOT in grantable set
- Lock icon + tooltip on non-grantable rows
- System roles render full matrix read-only with banner (no lock icons, different message)
- Server 403 on save → toast + revert entire draft to snapshot
- DirtySaveBar: sticky bottom, slide-up on dirty, shows changed count, Discard/Save buttons, Cmd+S shortcut

**i18n keys:** Added ~140 keys to en.json + hi.json under roles.*, orgs.*, invite.*, common.*

**Test fixes:** Fixed 2 vitest `.toBe(false, msg)` TS type errors in RbacPermissionMatrix.test.tsx (moved msg to expect() first arg per vitest API).

**Why:** Delegation security rule — backend authoritative, UI assists. Server 403 on escalation attempt reverts UI state and shows toast.

**Increment 1.1 — Permission Catalog (2026-05-29):**
- `src/admin/src/pages/roles/PermissionCatalogPage.tsx` → route `/settings/permissions` (gated platform.permissions.manage)
- Extended `src/admin/src/lib/rbacApi.ts`: added `isActive`/`roleCount` fields to `CatalogPermissionSchema`; added `createPermission`, `updatePermission`, `deletePermission` + param types + `PermissionApiErrorCode`.
- Sidebar: `ListChecks` icon, `platform.permissions.manage` server-permission gate.
- Error handling: 409/Permission.Duplicate → inline field error; 409/Permission.InUse → toast.error with count; 400 format → live inline; 403 → toast.error forbidden.
- Optimistic active toggle with rollback on error.
- CATALOG_QUERY_KEY = `['auth', 'permissions', 'catalog']`; invalidates both catalog and `['auth', 'permissions']` (matrix) after create.

**How to apply:** For any future permission-gated toggle, always check grantablePermissionIds not just serverPermissions. The two are different: serverPermissions = what you can DO; grantablePermissionIds = what you can GRANT to others.
