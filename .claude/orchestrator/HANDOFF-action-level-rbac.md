# Action-level (in-page) RBAC gating — IMPLEMENTED

**Status:** ✅ DONE (Option 2). Triggered + implemented 2026-06-01.
**Chosen approach:** provision the role with its real operational permissions **and** gate the in-page actions by permission.

## What shipped
1. **Role provisioned** — migration `database/migrations/046_grant_data_entry_operator_document_perms.sql`
   grants `DATA_ENTRY_OPERATOR` → `document.read` + `document.update` (applied to local DB).
   Verified live: `dataentry@snap.local` `/auth/me/permissions` now returns
   `["document.read","document.update","menu.documents.view"]`.
2. **Reusable gate** — `src/admin/src/components/shared/Can.tsx`: `<Can permission="..." | anyOf=[] | allOf=[]>`
   backed by `usePermission().hasServerPermission`; renders `fallback` until `permissionsLoaded`
   (no flash). SUPER_ADMIN passes because the wildcard is expanded server-side by
   `GetUserPermissionsQuery`.
3. **Documents page gated** — `src/admin/src/pages/documents/DocumentQueuePage.tsx`:
   Review → `document.read`, Assign → `document.update`, Export → `document.read`.
4. **Tests** — `src/admin/src/__tests__/DocumentQueuePage.test.tsx` updated with a controllable
   permission mock + negative tests (stripped user hides all; read-only shows Review, hides Assign).
   Full admin suite green (807 passed).

## Still mock-data (future, unchanged)
The Documents list itself is still `mockDocuments` (not wired to the RBAC-enforced Document
service). Roll the `<Can>` pattern out to the other operational pages (GST, GST Notices, ITR,
Loans, Callbacks) and replace mock queries with the real services when those are wired.

---
## Original context (for reference)

---

## The issue (reproduction)
- Test user `dataentry@snap.local` (role **DATA_ENTRY_OPERATOR**) has **exactly one** permission: `menu.documents.view` (verified via `GET /auth/me/permissions`).
- Sidebar correctly shows only **Dashboard + Documents** (permission-driven menu works), and direct navigation to other routes is now blocked (route guard works).
- BUT on the **Documents** page she sees **Review / Assign / Export** buttons and a populated document list — actions her permissions don't include.

## Why (root cause)
RBAC is enforced at three layers today; the 4th is missing:
1. ✅ **Menu visibility** — `GET /auth/me/menu` filters the sidebar by `menu.*.view` perms.
2. ✅ **Route access** — `RoutePermissionGuard` (in `ProtectedLayout`) blocks direct URL access to a page the user's perms don't allow (`src/admin/src/components/shared/RoutePermissionGuard.tsx`).
3. ✅ **API/data** — wired endpoints enforce `[RequiresPermission]` server-side.
4. ❌ **In-page action gating** — NOT implemented. Page buttons render unconditionally.

Compounding it: several operational pages are still **mock-data scaffolding**, not wired to the real RBAC-enforced services. Example — `src/admin/src/pages/documents/DocumentQueuePage.tsx`:
- `queryFn` returns a hardcoded `mockDocuments` array (≈line 179), so the list isn't permission-gated data.
- The page does not import `usePermission`; **Review / Assign / Export** are always rendered.

So `menu.documents.view` only grants *seeing* the menu/route — it says nothing about in-page actions, and nothing gates them.

## Fix plan (Option 2) — when triggered
1. **Provision the role properly.** Give `DATA_ENTRY_OPERATOR` its real operational permissions (e.g. `document.read`, `document.update`) so a genuine operator can work; a deliberately-stripped user (only `menu.documents.view`) cannot. (Do via the Roles & Permissions matrix or a seed/migration.)
2. **Gate in-page actions** by permission using `usePermission().hasServerPermission(code)` (hook already exposes `permissionsLoaded` + handles the server list). For Documents:
   - **Review** (open `/documents/:id`) → requires `document.read`
   - **Assign** → requires `document.update` (no dedicated `document.assign` exists in the catalog; closest is `document.update`)
   - **Export** → requires `document.read` (or introduce a report/export perm)
   - Hide (preferred) or disable each action when the perm is missing.
3. **Wire data to the real service** (eventually): replace `mockDocuments` with the RBAC-enforced Document service call so the list itself is server-gated, not just the buttons.

## Make it reusable
Action-level gating applies across operational pages (Documents, GST, GST Notices, ITR, Loans, Callbacks…), several of which are mock scaffolding. Consider a small `<Can permission="...">{button}</Can>` wrapper (or `useCan`) backed by `hasServerPermission` to keep gating consistent, then roll out page-by-page.

## Available document permissions (catalog)
`document.read`, `document.update`, `document.archive`, `document.share`. (No `document.review`/`document.assign` — map Review→read, Assign→update, or add new permission codes if finer granularity is wanted.)

## Reference — local test logins (LOCAL_AUTH, seeded 2026-06-01)
Super admin: `admin@snapaccount.local` / `Admin@12345`. Staff role users (password `Test@12345`): `ca@`, `support@`, `dataentry@`, `opsmgr@`, `bankrep@`, `reviewer@` `…@snap.local`. See [[customer-vs-staff-separation]] memory for the customer/staff model.

## Related (already shipped this session, may be uncommitted)
- `RoutePermissionGuard` (route-level guard) — `src/admin/src/components/shared/RoutePermissionGuard.tsx`.
- `usePermission` now returns `permissionsLoaded`.
- `GetAssignableRolesQuery` returns the role's permission list (fixes Edit-dialog "0 from role").
- Login page dark-mode contrast fix.
