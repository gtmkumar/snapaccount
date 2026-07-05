# SnapAccount — Session Handoff

**Last updated:** 2026-05-31. **Status: ✅ MERGED to `main`.**
This session's work shipped via **PR #30** (squash `9ce3580`). Branch `feat/team-staff-screens` deleted. Next work branches from `main`.
Prior module: Auth/RBAC base shipped in **PR #29** (`6f3856f`). Decisions memory: `auth-rbac-module-decisions` · local-run memory: `auth-local-dev-runbook`.

---

## 1. What shipped in PR #30 (all green locally; CI unavailable)

### Team module — SnapAccount-staff Screens 87/89/90 (`/team` tabs)
- **Staff (87):** roster from `GET /auth/admin/staff` (operational roles), live queue load, View / Edit-role / Deactivate row actions.
- **Workload (89):** staff × queue grid (GST, ITR, Chat, Callbacks), capacity alerts, load legend, CSV export.
- **KPIs (90):** reuses the real callback KPI; SLA/CSAT/FCR not tracked → honest "Not tracked yet"; per-staff table + CSV export.
- Backend: `workload-by-user` queries added to **GST + ITR** (Chat/Callback pre-existed); `GET /auth/admin/staff`; `SetUserActiveAdminCommand` (`POST /auth/admin/users/{id}/{activate|deactivate}`, self + last-admin guards).
- **Data honesty:** workload grid only shows queues with a per-staff assignee — Loans (assigned to a *bank*) and Documents (no assignee) are intentionally excluded.

### RBAC gap #1 — Dynamic navigation (data-driven sidebar)
- `auth.navigation_item` + `auth.menu_permission`; `GET /auth/me/menu` returns the permission-filtered tree (`*` wildcard match-all; unmapped item = public). `Sidebar.tsx` renders from it with a static fallback if the endpoint errors/empty.
- **Menu Management** screen `/settings/navigation` (SUPER_ADMIN): full CRUD — add/edit/reorder (numeric order), icon, url, parent, active, permission mappings. Endpoints `/auth/admin/navigation` (GET/POST/PUT/DELETE).
- **Behaviour note:** menu is permission-driven, not role-driven. An item gated by a perm (e.g. `settings.roles`→`org.roles.read`) now shows for anyone holding that perm; backend RBAC on the endpoints stays authoritative.

### RBAC gap #2 — Allow/Deny
- `is_allowed` on `role_permission` + `user_permission`. **`EffectivePermissionResolver` = allows − denies** (deny wins globally). **`*` is NOT constrained by deny** (super-admins unconstrained — deliberate).
- Authoring: tri-state **role matrix** (Inherit/Allow/Deny in `RolesPermissionsPage`); **per-user deny** in `EditUserDialog` (toggle an inherited perm OFF = deny override). `AddUserDialog` stays allow-only.

### RBAC gap #3 — Resource/Action type catalogs
- `auth.resource_type` + `auth.action_type` seeded from existing perms; nullable FKs on `permission` (backfilled 100%). String `resource`/`action` remain authoritative for `[RequiresPermission]`.
- `CreatePermission` composes from + **auto-creates** the type on first use (humanized name); `/auth/permission-meta` feeds the create-dialog comboboxes; **Manage types** dialog (rename / (de)activate) on the Permission Catalog page.
- **EF gotcha (fixed):** the type FKs are mapped relationship-only so EF orders inserts (type before permission) — without it Postgres rejected the insert.

### Cross-cutting
- **i18n interpolation fix (app-wide):** react-i18next is never initialised, so its `t` can't interpolate `{{}}`. All `useTranslation()` consumers had values inlined via template literals (ThemeToggle, CommandPalette, RoleGuard, Team tabs). Components using the custom `@/i18n` `t` are unaffected.
- **Migrations 042–045** (navigation, allow/deny, resource/action types, nav-mgmt menu) — **applied to local dev DB**; must be applied to staging/prod on deploy.

## 2. Tests
Backend unit: **AuthService 271** · GstService 33 · ItrService 38. Frontend vitest **817/817**. Build + lint clean.
- `dotnet test tests/unit/AuthService/AuthService.Tests.csproj --filter "Category=Unit"`
- `cd src/admin && npm run build && npm run lint && npx vitest run`
- Browser-verified live (Playwright): login, dynamic sidebar (confirmed data path, not fallback), Team tabs, tri-state matrix deny→DB, permission compose→auto-create types, menu CRUD round-trip.

## 3. Local run
- **Postgres** localhost:5432/snapaccount (trust auth; password `postgresql`). Logins: `admin@snapaccount.local`/`Admin@12345` (SUPER_ADMIN `*`), `manager@snapaccount.local`/`Manager@12345` (limited).
- **AuthService :5201** — `ASPNETCORE_ENVIRONMENT=Development LOCAL_AUTH=true ASPNETCORE_URLS=http://localhost:5201 dotnet run --no-launch-profile --project backend/Services/PlatformService/Platform.WebApi/Platform.WebApi.csproj`
- **Admin UI :3000** — `cd src/admin && npm run dev` (Vite proxies `/api/<prefix>` → fixed ports).
- Other 10 services GCP-gated; run per the prior runbook (ports 5102–5112) — most return 500 locally when not running (graceful degradation in the UI).

## 4. ⚠️ Pending / next work
1. **Restore CI (billing)** — *nothing in PRs #29/#30 has run through CI.* Highest priority. Then:
2. **Run integration tests (Testcontainers)** — NOT run this session; these Auth signatures changed: `GetUserDetail` (+`DeniedOverridePermissionIds`), `UpdateUserAdmin` (+`DeniedPermissionIds`), `SetRolePermissions` (+`DeniedPermissionIds`), `RolePermissionDto` (+`IsAllowed`), `CreatePermission` (auto-links types). Integration tests may reference the old shapes.
3. **Apply migrations 042–045 to staging/prod** when deploying (db-migrate workflow).
4. **react-i18next**: properly initialise it (or migrate the ~13 `useTranslation` components to the custom `@/i18n`) so `{{}}` interpolation works; new Team/Menu strings currently use inline English defaults (no hi/bn translations).
5. **Menu Management polish:** drag-to-reorder (currently a numeric order field); the page uses react-i18next inline defaults (no i18n keys yet).
6. **Deferred-by-design (not bugs):** `AddUserDialog` per-user deny; deny-vs-`*`.
7. **Older backlog (orig §5b):** wildcard-gate regression test, TOCTOU double-resolve, `initialPassword` silent-ignore, grant-accumulation cap, localStorage JWT, OTP plaintext log, PAN placeholder key, Firebase plist in git.

## 5. Agent pipeline (when usage credits restored)
(db-engineer ∥ ui-ux-agent) → backend-agent → frontend-dev → qa-web → security-reviewer. All report to orchestrator. File-ownership boundaries per CLAUDE.md. This session was built solo with the orchestrator's own tools.
