---
name: reference_admin_infra_facts
description: Reusable non-obvious admin-frontend facts — no client-side backend user id, assignable-agent roster source, per-page bulk-select pattern
metadata:
  type: reference
---

Non-obvious facts confirmed while building admin screens (src/admin):

- **No backend user id is exposed client-side.** `useAuth()` returns only `AdminUser { uid (Firebase), email, displayName, role }` — no backend user id. So an "assigned to me" filter that compares against a backend `assignedToUserId`/`assignedAgentId` CANNOT be built reliably (Firebase uid ≠ backend user id). Build All/Assigned/Unassigned buckets instead.
- **Assignable-agent roster** for callback/chat "assign to agent" pickers = `getStaffList()` from `lib/staffApi.ts` → `GET /auth/admin/staff` (returns `{userId, name, role, roleDisplayName, status}`). Handle 403 gracefully (roles without staff-list permission).
- **Bulk multi-select** is done per-page: the shared `DataTable` has NO built-in row selection. Pages add a `select` checkbox column driven by a `Set<string>` of ids in page state, plus the `SelectionToolbar` (fixed bottom bar). See `LoansListPage.tsx` / `NoticeTrackerListPage.tsx`.
- **i18n** (`@/i18n`): catalogs are FLAT dotted-key `Record<string,string>` maps (en/hi/bn.json), NOT nested. Interpolation is `{{param}}`. Parity test = key-set equality across all three, so always add a key to en+hi+bn together. `t()` falls back en→key.
- **RBAC in the UI is display-only** (`user.role`); real gate is `serverPermissions` via `RoutePermissionGuard`. For 403 sub-resource handling use `isForbiddenError` (`lib/apiError.ts`) + `AccessDeniedState`.
