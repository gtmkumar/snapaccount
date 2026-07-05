---
name: project_admin_rbac_enforcement_model
description: How admin-panel client-side RBAC actually works — serverPermissions is the real gate, user.role is display/coarse only; pickRole must fail closed
metadata:
  type: project
---

The admin panel (`src/admin`) has TWO parallel access layers, and confusing them causes security bugs (the 2026-07-05 ACM-01..15 sweep).

**Real enforcement = server permissions.** `usePermission()` fetches `GET /auth/me/permissions` and exposes `serverPermissions: string[]` (codes like `platform.roles.manage`, `chat.slots.manage`; `*` = wildcard for SUPER_ADMIN). `RoutePermissionGuard` (in `components/shared/RoutePermissionGuard.tsx`) maps each route prefix → a required permission via `ROUTE_PERMISSIONS` (mirrors the backend `auth.navigation_item` → `menu_permission` config) and renders `<ForbiddenPage/>` if the code is absent. Longest-prefix match, so detail routes inherit their section's permission. **To guard a new route, add it to `ROUTE_PERMISSIONS`** — the permission-driven sidebar only *hides* links; without a route entry a user can still type the URL.

**`user.role` (AdminRole) is display + coarse gating ONLY** — the sidebar badge, `ForbiddenPage` role label, the legacy static `PERMISSIONS` map in `usePermission`, and the `/settings` `AuthGuard requiredRoles`. It is NOT the authorization source of truth. AdminRole models only the 6 STAFF roles (SUPER_ADMIN, OPERATIONS_MANAGER, CA, SUPPORT_EXECUTIVE, DATA_ENTRY_OPERATOR, PARTNER_BANK_REP). Org-member roles (ORG_ADMIN/MANAGER/HR/REVIEWER) are intentionally NOT modelled.

**`pickRole(roles)` in `hooks/useAuth.ts` MUST fail closed** to `DATA_ENTRY_OPERATOR` (least privilege) for any unknown/org-member role — mirroring `getRoleFromToken`. A prior fail-open default of SUPER_ADMIN let org accounts reach the Razorpay panel (`/settings`) and the platform roles matrix (`/settings/roles`) and stored `role:"SUPER_ADMIN"` in localStorage. When multiple known staff roles are present it picks the highest-privilege one (e.g. `['SUPER_ADMIN','ORG_ADMIN']` → SUPER_ADMIN).

**403 ≠ empty.** Use `isForbiddenError(err)` from `lib/apiError.ts` + `<AccessDeniedState/>` (`components/shared/`) to distinguish an authorization failure from a genuine empty (200, no rows). Several list/KPI pages historically rendered a 403 as "0 records", hiding the failure. Pattern applied in StaffTab, UserListPage, LoansListPage KPI, CaAvailabilityPage.

See [[project_rbac_module1]].
