# SnapAccount — Session Handoff

**Last updated:** 2026-05-31. **Status: ✅ Auth/RBAC MERGED to `main` · 🚧 Team-staff screens (87/89/90) built on branch `feat/team-staff-screens`, uncommitted.**
Module 1 (Auth & RBAC) shipped via **PR #29** (squash `6f3856f`); handoff doc commit `f856a3b`. Branch `feat/auth-rbac-module` deleted.
Plan & decisions: `.claude/orchestrator/auth-rbac-module-scope.md` · decisions memory `auth-rbac-module-decisions` · local run memory `auth-local-dev-runbook`.

---

## 0-BROWSER. Live browser verification (this session)
Ran the app (AuthService :5101 rebuilt + admin :3000) and drove it via Playwright as `admin@snapaccount.local` (SUPER_ADMIN). Verified end-to-end:
- **Dynamic sidebar (gap #1):** renders from `/auth/me/menu` — confirmed the **data path** is live (only the *other* down microservices 500; `/auth/me/menu` + `/auth/me/permissions` returned 200, absent from the error list).
- **Team Staff (87):** real staff from `/auth/admin/staff` with Role/Status/queue/last-active + **View/Edit role/Deactivate** row actions. **Workload (89):** grid + capacity banner + Export CSV + legend (queues 0 = graceful, services down). **KPIs (90):** SLA cards show "Not tracked yet"; "Target 95%"; staff table + Export CSV.
- **Tri-state matrix (gap #2):** Inherit/Allow/Deny per permission. Clicked **Deny** on `accounting.journal.review` for `accounts_clerk` → Save → **DB confirmed `is_allowed=f`** (then restored to allow). Full stack proven: UI → API → command → DB.

**Bug class found & fixed (whole app):** files that call **react-i18next `useTranslation()`** can't interpolate `{{var}}` — react-i18next is never initialised in this app (no `initReactI18next`), so its `t` only echoes the plain-string default; `{{x}}` stays literal and an object-arg with no string default would echo the raw key. (Files importing `t` from `@/i18n` are fine — that custom `t` does interpolate and its keys live in en.json.) Swept all true `useTranslation()` consumers and inlined values via template literals: `WorkloadTab` (capacity + degraded), `KpiTab` ("Target 95%"), `StaffTab` (toasts), **`ThemeToggle`** (`{{theme}}`), **`CommandPalette`** (`{{query}}`), **`RoleGuard`** (403 `{{roleLabel}}`). `ReportsPage` already used template literals. Browser-verified CommandPalette ("No matches for …") + tabs; build/lint/**817 vitest** green.
**Latent follow-up:** the proper fix is to actually initialise react-i18next (or migrate those ~13 components to the custom `@/i18n` `t`) so future `{{}}` usage works; for now every call is inlined.

---

## 0y. ResourceTypes + ActionTypes — RBAC gap #3 (this session)
Promotes the free-text `permission.resource` / `permission.action` strings into first-class configurable catalogs (the diagram's Resource × Action model). Migration **044 applied** to local dev DB, idempotent.

**Schema (`044_auth_resource_action_types.sql`):** `auth.resource_type` + `auth.action_type` (key/name/description/is_active). Seeded from the **distinct** values already in `auth.permission` (14 resources, 89 actions — our `action` is the post-dot remainder, so the action catalog mirrors reality, not a clean verb set). Added nullable `resource_type_id` / `action_type_id` FKs to `auth.permission` and backfilled **100%** (91/91). String columns remain authoritative for `[RequiresPermission]`; the FKs are metadata.

**Backend:** `ResourceType` + `ActionType` entities/configs/DbSets; `GetPermissionMetaQuery` → `GET /auth/permission-meta` (active catalogs, gated by `platform.permissions.manage`).

**Fully filled (composition + auto-grow):** `Permission` gained `ResourceTypeId`/`ActionTypeId` FKs (+ `SetTypes`); **`CreatePermissionCommand` now links every new permission to its resource/action type, auto-creating the catalog entry on first use** (humanized name) and reusing existing ones — "add a module/action without code." `PermissionCatalogPage` create dialog now sources the resource + action comboboxes from `/auth/permission-meta` and flags "New resource/action type — will be added to the catalog." `rbacApi.getPermissionMeta()` added.
**EF gotcha (caught in browser):** the type FKs are mapped relationship-only (`HasOne<ResourceType>().WithMany().HasForeignKey(...)`, no nav props) so EF orders inserts (type before permission) in one SaveChanges — without this, Postgres rejected the insert with `permission_resource_type_id_fkey` (InMemory tests didn't catch it; the real DB did).
**Tests:** `GetPermissionMetaQueryTests` + `CreatePermissionTypeLinkTests` (new types created+linked, existing reused, multi-segment action humanized). **Browser+DB verified**: composed a new `widget.view` → auto-created ResourceType "Widget" + ActionType "View" + linked FKs (then cleaned up).

**Deferred (minor):** rename/deactivate of type catalog entries via a dedicated management UI (creation/auto-grow works; the rows are editable via SQL/future CRUD).

---

## 0z. Allow/Deny semantics — RBAC gap #2 (this session)
The permission model was grant-only (effective = union). It now supports explicit **DENY**. Branch `feat/team-staff-screens`, all green, **migration 043 applied to local dev DB** (idempotent, zero existing denies → no behavior change).

**Schema (`043_auth_permission_allow_deny.sql`):** `is_allowed BOOLEAN NOT NULL DEFAULT TRUE` on `auth.role_permission` + `auth.user_permission` (+ partial indexes on the deny legs). All existing rows = allow.

**Engine:** `RolePermission`/`UserPermission` entities gained `IsAllowed` (Create overloads, default true) + EF config mapping. **`EffectivePermissionResolver` rewritten**: each leg projects `(name, isAllowed)`; effective = **(all allows) − (all denies)**, deny wins globally across roles + direct grants. Because the resolver is the *single* resolution point (login token → `PermissionBehavior`, `/auth/me/permissions`, menu, delegation), deny propagates system-wide with **no change to the flat-set check contract**.

**Deliberate policy:** deny is subtractive over concrete permission names; it does **not** constrain the `*` wildcard — super-admins stay unconstrained. Documented in the resolver + migration.

**Tests:** AuthService unit **256** (+5 `EffectivePermissionResolverTests` + 3 `SetRolePermissionsAllowDenyTests`); frontend vitest **817** (matrix tri-state). Build+lint clean. **E2E verified**: a rolled-back transaction seeded a per-user deny and confirmed the resolver-net SQL flips the perm from present→absent.

**Authoring UI (now built):** the role permission matrix is **tri-state** — each permission row is an `Inherit | Allow | Deny` segmented control. `SetRolePermissionsCommand` gained an optional `DeniedPermissionIds` (backward-compatible); it reconciles allow/deny rows, **flips** an existing row's flag when its state changes, and soft-deletes omitted perms. Delegation bounds only the *allow* set (deny is restrictive → any catalog perm). `GetOrgRoleDetail` now returns `IsAllowed` per perm so the matrix loads deny state; `rbacApi.setRolePermissions(allow, deny)` + `PermissionDetail.isAllowed` (optional, defaults allow). Non-grantable perms can't be switched *into* Allow (delegation) but their current state stays visible.
Tests: backend `SetRolePermissionsAllowDenyTests` (persist allow+deny, flip allow→deny + remove omitted, validator rejects allow∩deny); matrix vitest updated for the tri-state control (allow marks dirty; deny → Save sends `(roleId, allowIds, denyIds)`).

**Per-user deny (now built):** `UpdateUserAdmin` + `GetUserDetail` carry deny overrides (`DeniedPermissionIds` / `DeniedOverridePermissionIds`); `EditUserDialog` makes an *inherited* permission's toggle interactive — OFF = a per-user deny override that subtracts the role-granted perm (badge flips inherited→denied), ON = remove it. `AddUserDialog` untouched (deny props are opt-in on the shared `OverrideModuleSection`). `UserPermission.SetAllowed` added; reconcile flips flag + soft-deletes omitted. Tests: `UpdateUserAdminDenyOverrideTests` (persist deny, flip deny→allow + remove omitted, validator rejects allow∩deny). Browser: Edit dialog opens clean with the new detail shape (interactive toggle not pixel-verified — covered by unit tests + the role-matrix deny which WAS browser+DB verified). **deny-vs-`*` intentionally unsupported.**

---

## 0a. Dynamic Navigation module — RBAC gap #1 (this session)
Closes the biggest gap vs the "enhanced" authz reference model: the sidebar was a **hardcoded array** in `Sidebar.tsx`; it is now **backend-driven & permission-filtered**. Branch `feat/team-staff-screens` (same WIP branch), all green, **migration 042 applied to local dev DB**.

**Schema (migration `042_auth_navigation_menu.sql`, applied + idempotent):** `auth.navigation_item` (self-ref `parent_id`, `key`, `label`, `icon_key`, `url`, `display_order`, `is_active`) + `auth.menu_permission` (`menu_id`, `permission_id`, `is_required`). Seeded 19 items mirroring the old sidebar + 14 new `menu.<key>.view` perms; the 4 admin items reuse existing perms (`org.roles.read`, `platform.orgs.read`, `platform.permissions.manage`, `platform.refdata.manage`). Role grants reproduce the old `requiredRoles` (SA 14 / OM 13 / CA 8 / SE 7 / DEO 1 / PBR 1). **Gotcha:** `menu_permission` ON CONFLICT must restate the partial-index predicate `WHERE deleted_at IS NULL` (same as 038's note).

**Backend:** entities `NavigationItem` + `MenuPermission` (+ EF configs, DbSets on Auth(I)DbContext); `GetMyMenuQuery` → `GET /auth/me/menu` (self-scoped, no extra perm). Resolution: reuse `EffectivePermissionResolver`; an item with **no** mapping is public; otherwise visible if the user holds **any** mapped perm (OR); `*` wildcard matches all; assembles a parent/child tree ordered by `display_order`.

**Frontend:** `menuApi.getMyMenu()` (recursive zod tree); `navIcons.ts` maps `icon_key`→lucide (unknown→`Circle`); `Sidebar.tsx` now renders the fetched tree (flattened) and **falls back to the static role-gated list if `/auth/me/menu` errors or is empty** — zero-regression rollout.

**Behavior note (deliberate):** the menu is now **permission-driven, not role-driven**. The old sidebar gated by role AND perm; the new one by perm only. For platform-only items nothing changes (only SA holds those perms). For `settings.roles` (mapped to `org.roles.read`), any role holding that perm (e.g. CA) now sees the menu entry — backend RBAC on the actual endpoints remains authoritative, so this is visibility only.

**Tests:** AuthService unit **248** (+4 `GetMyMenuQueryTests`: perm filter, wildcard, public-unmapped, tree); frontend vitest **817** (+4: `Sidebar` data+fallback, `menuApi` schema). Build+lint clean.

**Next (RBAC gaps #2/#3):** Allow/**Deny** flag on `role_permission`/`user_permission` (+ deny-wins resolver); normalize `ResourceTypes`/`ActionTypes` catalogs. Also: an admin CRUD UI for navigation items (the schema supports it; no editor yet).

---

## 0. SnapAccount-staff Team screens — Screens 87/89/90 (this session)
Full vertical slice, all green, **not yet committed** (branch `feat/team-staff-screens` off `main`). Built as 3 new tabs on the existing `/team` page (`members | invites | roles | **staff | workload | kpis**`); `members` stays default so the 794 prior frontend tests are untouched.

**Backend (3 new queries + endpoints, fan-out aggregation pattern):**
- `GET /gst/admin/workload-by-user` — per-CA GST-notice load (group `GstNotices` by `AssignedCaId`; open = Status≠CLOSED, completed = CLOSED).
- `GET /itr/admin/workload-by-user` — per-assignee ITR grievance load (group `Grievances` by `AssignedTo`; open = OPEN/IN_PROGRESS, completed = RESOLVED/CLOSED).
- `GET /auth/admin/staff?role=` — richer staff roster (id/name/email/role/status/joined/lastActive) for operational roles only; whitelist guards against customer enumeration. All three `[RequiresPermission("admin.dashboard.read")]`.

**Frontend:** `src/admin/src/lib/staffApi.ts` (fans out staff + GST/ITR/Chat/Callback workload, merges by userId, resilient zeros); tab components `StaffTab`/`WorkloadTab`/`KpiTab` + shared `workloadColors.ts`. KPI tab reuses the real `getCallbackKpi`.

**Staff row actions (Screen 87):** View → `/users/:id`; Edit role → reuses shared `EditUserDialog`; Deactivate/Reactivate → confirm dialog + new `POST /auth/admin/users/{id}/{deactivate|activate}` (`SetUserActiveAdminCommand` — flips `IsActive` only, self-guard + last-wildcard-admin guard, codes `User.SelfDelete`/`User.LastAdmin`; **note** `Error.NotFound(resource,id)` appends `.NotFound` to the code, `Error.Conflict` does not). Edit/Deactivate gated by `platform.admins.invite`; View always shown. Frontend `setAdminUserActive()` in `userAdminApi.ts`.

**CSV export (Screens 89/90):** reusable `src/admin/src/lib/csv.ts` (`toCsv` pure RFC-4180-ish escaping, `downloadCsv` Blob+BOM, `csvFilename` date-stamped). Wired into the Workload grid and the KPI staff-performance table via "Export CSV" buttons.

**Honest data-availability decisions (important):**
- Workload grid columns = only queues that track a *per-staff* assignee: **GST, ITR, Chat, Callbacks**. **Documents** have no assignee and **Loans** are assigned to a *bank* (not a staff member) → both intentionally excluded.
- KPIs with no backing schema (Document/GST/ITR review SLA, FCR rate, CSAT, avg handle time) render as "—" / "Not tracked yet" — NOT fabricated. When trackers land, swap the placeholder MetricCards for live values.

**Tests (all green):** backend GstService 33 · ItrService 38 · AuthService **244** (GetStaffList 3 + SetUserActive 6 new); frontend vitest **813/813**, lint+build clean. New: `tests/unit/{GstService,ItrService}/*WorkloadByUserTests.cs`, `tests/unit/AuthService/{GetStaffListQueryTests,SetUserActiveAdminCommandTests}.cs` (added `AuthService.Infrastructure` + EFCore.InMemory refs to that test csproj), `src/admin/src/__tests__/{staffApi,TeamStaffTabs,csv}.test.ts(x)`.

**Next:** commit + PR; optional follow-ups — add Document/GST/ITR SLA + callback CSAT/FCR trackers (db-engineer) to light up the placeholder KPIs; drag-to-rebalance on the Workload grid (design 89 stretch — needs real cross-service reassignment endpoints, not yet built).

---

## 1. What shipped (all green, live-verified)
Multi-tenant Auth/RBAC, built as full vertical slices:
- **Base RBAC** — SuperAdmin → OrgAdmin → employees; custom roles + permission matrix; **constrained delegation** (you can only grant a subset of your own effective perms; server-enforced, 403 on escalation); orgs / members / invites (72h token) / public invite-accept.
- **1.1** Permission Catalog (create/edit/delete perms). **1.2** Real retire (`is_active`) + role counts. **1.3** Add User (role + per-user `user_permission` overrides; effective = role ∪ overrides; **I1.3-001**: only true `*` SUPER_ADMIN may assign platform/system roles). **1.4 Phase A** Reference-data CRUD. **1.4 Phase B** full user **Edit/Delete** (KYC profile, PAN encrypted SEC-013, masked on read; self-delete + last-admin guards).
- **Users vs Team split** — Users list = customers only (no active platform `user_role`) + UserType filter; staff live on Team (org-team page exists; SnapAccount-staff workload/KPI screens NOT built — see §5).
- **Role model = two families** — 036 catalog `SUPER_ADMIN/ORG_ADMIN/CA/MANAGER/HR/REVIEWER` (org-tenant RBAC) + operational `OPERATIONS_MANAGER/SUPPORT_EXECUTIVE/DATA_ENTRY_OPERATOR/PARTNER_BANK_REP/CA` (SnapAccount internal staff). Legacy `SYSTEM_ADMIN` unified → `SUPER_ADMIN` everywhere (mig 041); `ADMIN/OPS/LOAN_OFFICER` aliases retired.
- **Local-dev hardening** — `GcpStartup.IsEnabled()` lets all 12 services boot without GCP creds (prod unaffected); 401 interceptor clears full session (kills the zombie logged-in-without-token loop).
- Migrations applied: **035–041**.

## 2. Tests
Backend unit **314/314** · integration **102/102** (Auth 7 · AddUser 17 · EditDelete 13 · Rbac 20 · PermCatalog 22 · RefData 23) · admin frontend vitest **794/794**, lint+build clean.
- `cd backend && dotnet test tests/unit/AuthService/AuthService.Tests.csproj`
- Integration: **run per-class** (`--filter "FullyQualifiedName~<Class>"`). The all-at-once parallel run thrashes local Docker (6 Testcontainers at once) and flakes/hangs — environment limit, not code.
- `cd src/admin && npm run build && npm run lint && npx vitest run`

## 3. Local run
- **Postgres** localhost:5432/snapaccount (trust auth; password `postgresql`). Logins: `admin@snapaccount.local`/`Admin@12345` (SUPER_ADMIN, `*`), `manager@snapaccount.local`/`Manager@12345` (limited — delegation/403 demos). Dev org `11111111-1111-1111-1111-111111111111`.
- **AuthService :5101** — `ASPNETCORE_ENVIRONMENT=Development LOCAL_AUTH=true ASPNETCORE_URLS=http://localhost:5101 dotnet run --no-launch-profile --project backend/Services/AuthService/AuthService.Api/AuthService.Api.csproj`
- **Admin UI :3000** — `cd src/admin && npm run dev`. (Vite proxies `/api/<prefix>` → fixed ports per `vite.config.ts`.)
- **Other 10 services** (GCP-gated, on their proxy ports) — per service:
  `ASPNETCORE_ENVIRONMENT=Development DEV_AUTH_BYPASS=true DB_PASSWORD=postgresql ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql" ASPNETCORE_URLS=http://localhost:<PORT> dotnet run --no-build --no-launch-profile --project Services/<Svc>/<Svc>.Api/<Svc>.Api.csproj`
  Ports: Document 5102, Accounting 5103, Gst 5104, Loan 5105, Itr 5106, Chat 5107, Notification 5108, Report 5109, Subscription 5110, Ai 5111, Callback 5112.
- A 500 on `/auth/local/login` usually = AuthService not running on :5101 (Vite proxy → connection-refused).

## 4. ⚠️ Known issues
- **GitHub Actions CI is down (account billing)** — every job fails at setup in 2–3s: *"recent account payments have failed or your spending limit needs to be increased."* No PR gets CI validation until Settings → Billing & plans is fixed. The module merged on local verification only.
- **4 dashboard endpoints still 500** locally (separate from boot/GCP, likely un-migrated schemas / empty data in their services): `/auth/admin/team-members` is FIXED; remaining suspects when running all services — `/chat/admin/workload-by-user`, `/notifications/inbox`, `/gst/notices/due-summary`. Investigate when those modules are worked.

## 5. Suggested next work (branch from `main`)
1. **SnapAccount-staff Team module** — design Screens 87 (staff list w/ queue+SLA), 89 (workload grid), 90 (KPI dashboard). The current Team page only covers the org-team case.
2. **Restore CI** — once billing is fixed, confirm the pipeline goes green (it has never run against this code).
3. **Deferred backlog** (non-blocking, scope §5b): wildcard-gate regression test (I1.3-001), I1.3-002 double-resolve TOCTOU, I1.3-003 initialPassword silent-ignore, grant-accumulation cap, "1 member" pluralization, Phase-A `_ => 0` default in `CountUsagesAsync` → throw, Firebase plist in git, localStorage JWT, OTP plaintext log, PAN placeholder key.

## 6. Agent pipeline (when usage credits restored)
Pipeline: (db-engineer ∥ ui-ux-agent) → backend-agent → frontend-dev → qa-web → security-reviewer. All report to orchestrator (subagents have no SendMessage). File-ownership boundaries per CLAUDE.md. Heavy-context agents were credit-blocked this run, so the orchestrator built solo with its own tools.
