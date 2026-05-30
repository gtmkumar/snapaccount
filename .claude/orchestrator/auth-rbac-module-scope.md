# Module 1 — Auth & RBAC (Multi-Tenant, Custom Roles, Constrained Delegation)

> Single source of truth for the Auth/RBAC vertical slice. All agents read this first.
> Owner: orchestrator. Status: ACTIVE. Created: 2026-05-29.

## 1. Product Decisions (locked)

1. **B2B multi-tenant.** Hierarchy:
   - `SUPER_ADMIN` (platform/SnapAccount staff) — registers Org Admins, manages the global
     permission catalog and system roles. Cross-org visibility.
   - `ORG_ADMIN` (per organization) — owns an organization, invites/onboards employees
     (CA, Manager, HR, Reviewer, data-entry users…), creates custom roles **within their org**,
     assigns permissions to those roles. Scoped to their org only.
   - `Employees` (CA / Manager / HR / Reviewer / user…) — hold org-scoped roles. May themselves
     be granted user/role/permission management capability (see Delegation rule).
2. **Custom roles + permission matrix.** Roles are data, not hard-coded. Admins create/edit roles
   and toggle permissions per module in a matrix UI (Dribbble HRIS "Permissions settings" pattern:
   left = role list, right = permissions grouped by module with row toggles + search).
3. **Full vertical slice** this round: UI/UX design → DB migration → backend endpoints → frontend
   pages, all wired, then user review.
4. **Constrained delegation (NO privilege escalation) — CRITICAL SECURITY RULE.**
   A user can only grant/assign permissions that are a **subset of their own effective permissions**.
   - When `ORG_ADMIN` gives a role (e.g. "HR Manager") the `org.roles.manage` /
     `org.members.manage` capability, that grantee can manage users/roles — but the set of
     permissions they may toggle ON for any role is bounded by **their own** grant set.
   - A delegate can never grant a permission they do not themselves hold.
   - A delegate can never assign a role whose permission set exceeds their own effective set.
   - This must be enforced server-side (authoritative), not just in the UI.

## 2. Tenancy & Scoping Model

- **Platform scope**: `auth.user_role` (existing) holds platform-level roles (SUPER_ADMIN).
- **Org scope**: `auth.organization_member` (existing) binds a user to an org with an org role.
- Custom roles must be **org-scoped** (a `role.organization_id` nullable column: NULL = system/global
  role owned by platform; non-NULL = custom role owned by that org). System roles are read-only to
  org admins.
- Permissions are **global definitions** (the catalog) but **granted per-role**; effective permissions
  for a user = union of (platform role perms) + (org role perms for the active org).
- `ICurrentUser` already exposes `OrganizationId`. Org-scoped checks must verify the resource's org
  matches the caller's active org (except SUPER_ADMIN, who bypasses org scoping).

## 3. Permission Catalog (seed this module's perms; reuse existing naming `resource.action`)

Auth/RBAC management permissions to ADD + seed:
- `org.members.read`, `org.members.invite`, `org.members.update`, `org.members.remove`,
  `org.members.suspend`
- `org.roles.read`, `org.roles.create`, `org.roles.update`, `org.roles.delete`,
  `org.roles.assign` (assign role to a member)
- `org.permissions.read` (view catalog), `org.permissions.grant` (toggle perms on a role —
  bounded by delegation rule)
- `org.settings.read`, `org.settings.update`
- Platform-only: `platform.orgs.read`, `platform.orgs.create`, `platform.orgs.suspend`,
  `platform.admins.invite`, `platform.roles.manage`, `platform.permissions.manage`

Keep existing service perms (`gst.*`, `accounting.*`, `document.*`, `chat.*`, `callback.*`, `itr.*`)
and include them in the catalog so the matrix can show ALL modules.

## 4. Per-Agent Deliverables

### db-engineer  (owns: database/, docs/database/)
- Additive migration extending the existing auth schema (do NOT rewrite 001):
  - `auth.role.organization_id UUID NULL` (FK → auth.organization), index it; system roles keep NULL.
  - `auth.role.created_by_user_id UUID NULL` for provenance.
  - Invitation table: `auth.invitation` (id, organization_id, email, phone_number NULL,
    role_id, invited_by_user_id, token_hash UNIQUE, status [PENDING/ACCEPTED/REVOKED/EXPIRED],
    expires_at, accepted_at, audit cols, soft-delete, RLS).
  - Seed migration for the new permission catalog (section 3) + baseline system roles
    (SUPER_ADMIN, ORG_ADMIN, CA, MANAGER, HR, REVIEWER) with sensible default role_permission rows.
  - RLS policies for org isolation on `auth.role` (custom roles) and `auth.invitation`.
- Update `docs/database/` schema docs. **Message backend-agent when migration + seed are ready**,
  including exact table/column names.

### ui-ux-agent  (owns: docs/design/)
- Use Stitch MCP (if configured) to design, else produce detailed specs + ASCII/markdown layouts:
  - **Role & Permission matrix** screen (left role list w/ search + "create role"; right = permissions
    grouped by module, collapsible sections, row-level toggle switches, "select all in module",
    dirty-state save bar). Show delegation: perms the current user can't grant render disabled/greyed.
  - **Organizations** list (SUPER_ADMIN) + **org detail**.
  - **Members/Employees** list within an org (invite, role chip, suspend, remove) + **invite modal**
    (email/phone + role select).
  - **Invite acceptance** page (token-based, set password / link account).
- Extend existing design tokens; do not replace prior design system. **Message frontend-dev when
  screen specs are ready.**

### backend-agent  (owns: backend/)  — waits for db-engineer
- AuthService: MediatR commands/queries + Minimal API endpoints:
  - Roles: `GET/POST /auth/org/roles`, `GET/PUT/DELETE /auth/org/roles/{id}`,
    `GET /auth/org/roles/{id}/permissions`, `PUT /auth/org/roles/{id}/permissions` (set grants).
  - Permissions catalog: `GET /auth/permissions` (grouped by module), and
    `GET /auth/me/grantable-permissions` (the subset THIS caller may delegate — drives matrix disabling).
  - Members/employees: implement the endpoints the frontend already calls in
    `src/admin/src/lib/teamApi.ts` but mapped to org scope:
    `GET /auth/org/members`, `POST /auth/org/members/invite`, `PATCH /auth/org/members/{id}`,
    suspend/reactivate/remove, `GET /auth/org/invites`, resend/revoke.
  - Invitation accept: `GET /auth/invite/{token}` (validate), `POST /auth/invite/{token}/accept`.
  - Organizations (platform): `GET/POST /auth/admin/organizations`, suspend.
- **Enforce delegation rule server-side**: a `[RequiresPermission]` check is necessary but NOT
  sufficient — add an application-layer guard so create/update-role and grant-permission operations
  reject any permission not in the caller's effective set, and reject assigning a role whose perms
  exceed the caller's. Add `org.*` permission constants. Make `PermissionBehavior` / checks
  org-scope-aware (verify target org == caller org unless SUPER_ADMIN).
- Add a backend `DEV_AUTH_BYPASS` path if missing so the admin UI works locally; keep production safe.
- Result<T> pattern, FluentValidation, no controllers, entity configs in separate files.
- **Message frontend-dev AND qa-web with the final API contract (routes + DTOs).**

### frontend-dev  (owns: src/admin/)  — waits for backend-agent + ui-ux-agent
- Build pages with TanStack Query + i18n (`t()`), Tailwind v4, all calls through `src/admin/src/lib/`:
  - Role & Permission matrix page (consumes `/auth/org/roles`, `/auth/permissions`,
    `/auth/me/grantable-permissions`; disable/grey toggles the user can't grant).
  - Organizations page (SUPER_ADMIN) + org detail.
  - Members/Employees management (wire/replace the existing `teamApi.ts` stubs to the real org endpoints).
  - Invite acceptance route (public, token-based).
  - Gate nav/menu items by permission via the existing `/auth/me/permissions` mechanism.
- **Message qa-web when UI is wired.**

### qa-web  (owns: tests/, src/admin/src/__tests__/, .claude/qa/)  — waits for frontend-dev
- Backend: xUnit unit + integration tests for role CRUD, permission grant, **delegation/privilege-
  escalation rejection** (a delegate cannot grant perms beyond their own), org isolation.
- Frontend: component tests for the matrix (disabled toggles for non-grantable perms), invite flow.
- Run full regression. **Message security-reviewer + report results to orchestrator.**

### security-reviewer  (owns: docs/security/, read-only elsewhere)  — reviews as code lands
- Focus: privilege-escalation via delegation, org tenant isolation (IDOR across orgs), invite-token
  entropy/expiry/replay, RLS correctness, no secrets, input validation at boundaries.
- Produce a findings report in `docs/security/`. **Report to orchestrator.**

## 5. Acceptance Criteria (orchestrator review gate)
- [ ] Migration applies cleanly; catalog + baseline roles seeded; RLS enforces org isolation.
- [ ] SUPER_ADMIN can create an org + invite an Org Admin.
- [ ] Org Admin can create a custom role, toggle permissions (matrix), invite an employee, assign role.
- [ ] A delegate granted `org.roles.manage` can ONLY toggle permissions within their own grant set
      (verified by a failing-then-passing test); server rejects escalation attempts (403).
- [ ] Org isolation: org A cannot read/modify org B's roles/members (server-enforced, tested).
- [ ] Invite acceptance flow works end-to-end (token validate → accept → account active).
- [ ] Frontend matrix greys out non-grantable permissions; nav gated by permissions.
- [ ] `dotnet build` + `dotnet test` green; `npm run build` + `npm run lint` (zero warnings) + vitest green.
- [ ] Security review report filed with no critical/high open items.

## 5b. Security Backlog (deferred follow-ups — NOT blockers for this round)
From the early security pass (2026-05-29); user chose to defer. Track for a later hardening task:
- **Firebase iOS config in git** (`mobile/ios/.../GoogleService-Info.plist`, project snapaccount-44625):
  remove from git tracking; add API-key restrictions + Firebase App Check in GCP. Owned by
  devops/mobile-dev. (Client config key — low real risk, but should not be tracked.)
- **LOCAL_AUTH JWT in localStorage** (XSS-accessible); add server guard so `LOCAL_AUTH=true` cannot
  run in staging/prod.
- **OTP plaintext logged** in non-prod/staging environments — gate to dev-only.
- **Placeholder PAN encryption key** (all-zeros) committed in `appsettings.json` — replace with real
  secret management before any real PII.
Note: RLS-session-var (M1-003) and `/auth/me/permissions` returns-role-names (M1-004) were NOT
deferred — they were fed into backend-agent to fix this round.

Increment 1.3 non-blocking follow-ups (security GO; address in a hardening/coverage pass):
- Add xUnit regression test: a `platform.admins.invite` holder WITHOUT `"*"` gets 403 on platform-scope system-role assignment (behavior verified live + build green, but no permanent test yet).
- I1.3-002 (MED): CreateUserAdmin calls the effective-permission resolver twice (minor TOCTOU window) — resolve once and reuse.
- I1.3-003 (LOW): `initialPassword` is silently ignored when LOCAL_AUTH is off — return a clear note/validation instead of silent drop.
- I1.3-INFO-001: unbounded per-user direct-grant accumulation — consider a cap / cleanup.
- Cosmetic: "1 members" → "1 member" pluralization in role/member counts.

## 5c. Increment 1.1 — Hardening + Permission Catalog Management (added 2026-05-29)
User-requested follow-on after live testing:

**A. Harden org-scoped writes (backend-agent)** — A stale/invalid `organizationId` (e.g. all-zeros from a pre-fix token, or an org that doesn't exist) currently causes `CreateOrgRole` (and likely other org-scoped inserts) to 500 on a FK violation. Instead: validate the caller's active org exists (and the caller belongs to it) BEFORE the insert, and return a clean `Result` failure → 400/409 with a clear message ("Your session's organization is no longer valid — sign in again."). Apply to create-role, set-permissions, invite, member ops. Add a test.

**B. Permission Catalog management screen (SUPER_ADMIN only)** — gated by `platform.permissions.manage`.
- Permissions remain **global** definitions (not org-scoped). IMPORTANT caveat to surface in the UI: a permission created here only *enforces* if backend code references it via `[RequiresPermission("...")]`; otherwise it's an inert catalog entry. The screen manages the catalog (code, resource, action, description, active flag), it does not generate enforcement.
- **backend-agent**: add endpoints — `POST /auth/permissions` (create: name `resource.action`, description), `PUT /auth/permissions/{id}` (edit description/active), `DELETE /auth/permissions/{id}` (soft-delete / deactivate; block or warn if any role_permission references it). All `[RequiresPermission("platform.permissions.manage")]`. Validate name format (`^[a-z0-9_]+(\.[a-z0-9_]+)+$`), uniqueness. Return the created permission.
- **ui-ux-agent**: spec a "Permission Catalog" screen (SUPER_ADMIN) under docs/design — table grouped by module, "Create permission" dialog (module/resource, action, description), edit/deactivate, the inert-without-code caveat shown inline. Extend existing tokens.
- **frontend-dev**: build the screen (route e.g. `/settings/permissions`, nav-gated by `platform.permissions.manage`), client fns in `src/admin/src/lib/`, TanStack Query, i18n via `@/i18n` `t()` (NOT react-i18next), Tailwind v4. New catalog entries must appear in the role-permission matrix.
- **qa-web**: tests incl. non-super-admin gets 403 on create/edit/delete; created perm shows in catalog + matrix; name validation.
- **security-reviewer**: confirm `platform.permissions.manage` gating, no privilege bypass (creating a perm then granting it must still respect delegation), input validation.

## 5d. Increment 1.2 — Make permission Active/deactivate + roleCount real (added 2026-05-29)
User chose "Real deactivate". QA found the Active toggle + "# roles" count are cosmetic (no is_active column; catalog query returns neither field; UpdatePermission ignores isActive).

Semantics: **is_active=false = RETIRED** — the permission stays in the catalog (shown via Inactive filter) but is **excluded from the role matrix, from grantable-permissions, and from effective-permission resolution** (a retired permission grants nothing). **Delete** still fully removes (soft-delete) with the in-use guard.

- **db-engineer**: additive idempotent migration `037` — `ALTER TABLE auth.permission ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`. Index optional. Update docs/database.
- **backend-agent** (after db):
  - `GetPermissionCatalogQuery`: add `isActive` (from column) and `roleCount` (LEFT JOIN count of active `role_permission`). Add `?includeInactive=bool` (default false). Default (matrix path) returns ACTIVE only; `includeInactive=true` returns all (catalog screen).
  - Exclude inactive permissions from `GetGrantablePermissions` and from effective-permission resolution used by the delegation guard (`ResolveCallerEffectivePermissionsAsync`) and `/auth/me/permissions`.
  - `UpdatePermissionCommand`: honor `isActive` (set the column; do NOT touch deleted_at).
  - I1.1-001 (MED): on `DeletePermission`, also clean up / hard-remove the related `role_permission` rows (no orphaned soft-deleted grants).
  - I1.1-002 (LOW): make the name-uniqueness check case-insensitive.
- **frontend-dev**:
  - Catalog page calls `GET /auth/permissions?includeInactive=true`; matrix keeps the default (active-only). Toggle now persists `isActive`; "# roles" shows real `roleCount`.
  - I1.1-INFO-001: confirm `description` renders as a text node (no `dangerouslySetInnerHTML`).
- **qa-web**: deactivate hides perm from matrix + makes it non-grantable; reactivate restores; roleCount accurate; delete removes role_permission rows; full regression.
- **security-reviewer**: quick re-confirm (retired perm truly can't be granted/enforced).

## 5e. Increment 1.3 — Admin "Add User" (create user + role + per-user permission overrides) (added 2026-05-29)
The "Add User" button on /users (UserListPage) is currently a no-op stub. Build a full create-user flow. User decisions: (1) the dialog supports BOTH a platform user (platform role e.g. SYSTEM_ADMIN) OR an org member (org + org role), chosen in the form; (2) permissions = role-based PLUS per-user direct overrides (new concept).

**New model — per-user permission grants:**
- New table `auth.user_permission` (id, user_id FK, permission_id FK, organization_id UUID NULL [NULL=platform/global grant; non-null=scoped to that org], granted_by_user_id, audit, soft-delete, RLS). Unique on (user_id, permission_id, coalesce(organization_id, all-zeros)). Exclude retired (is_active=false) permissions.
- **Effective permissions** for a user (in active-org context) = platform-role perms ∪ active-org-role perms ∪ user_permission grants where (organization_id IS NULL OR = active org), minus retired perms. Update EVERYWHERE this is computed: `ResolveCallerEffectivePermissionsAsync` (delegation guard), `GetUserPermissionsQuery` (/auth/me/permissions), `GetGrantablePermissions`, LocalAuth JWT issuance.

**Delegation (CRITICAL, same no-escalation rule):** the creating admin may only:
- assign a role whose permission set ⊆ the caller's effective set, AND
- directly grant permissions ⊆ the caller's effective set.
- Assigning a PLATFORM role (SYSTEM_ADMIN/SUPER_ADMIN/Ops) requires SUPER_ADMIN (wildcard) or an explicit platform perm; a non-super-admin cannot mint a platform admin. Enforce server-side; return 403 Role.PrivilegeEscalation on violation.

**Per-agent:**
- **db-engineer**: migration 038 — `auth.user_permission` table + RLS + indexes + docs.
- **backend-agent**: `POST /auth/admin/users` (CreateUserAdminCommand): inputs {fullName, email, phoneNumber, scope: "platform"|"org", roleId, organizationId? (required if scope=org), permissionIds?: guid[] (direct overrides), initialPassword? (LOCAL_AUTH dev only → set password_hash so the user can local-login; prod path = invite/Firebase)}. Creates User (+profile/preference), assigns role (UserRole if platform, OrganizationMember if org), inserts user_permission rows for overrides. Enforce delegation + platform-role guard + OrgContextGuard for org scope. Add a roles-for-assignment endpoint: `GET /auth/assignable-roles?scope=platform|org` (platform=system roles the caller may assign; org=caller's org roles). Update effective-perm resolution (above). Tests incl. escalation rejection (can't grant beyond own set; non-super-admin can't assign SYSTEM_ADMIN). Build+test green; report contract.
- **ui-ux-agent**: spec the "Add User" dialog (docs/design) — scope segmented control (Platform / Organization); Organization picker (when org); Role dropdown (assignable roles for the chosen scope); name/email/phone; LOCAL_AUTH initial-password field (dev); a "Permission overrides" section = the matrix/multiselect of grantable permissions (non-grantable greyed, like the role matrix) with a note that role perms are inherited and these are EXTRA direct grants; show effective-perms preview. Extend existing tokens/components.
- **frontend-dev**: wire the Add User button (UserListPage) → dialog; `createAdminUser` + `listAssignableRoles` in src/admin/src/lib/; TanStack Query (invalidate the users list); @/i18n t() (NOT react-i18next); permission-override selector greys non-grantable perms (uses /auth/me/grantable-permissions). Gate the Add User button by the right perm (e.g. platform.admins.invite or org.members.invite depending on capability). Build+lint+vitest green.
- **qa-web**: create platform user (SYSTEM_ADMIN) as SUPER_ADMIN works; non-super-admin cannot assign SYSTEM_ADMIN (403); direct grant beyond caller's set rejected (403); created user's effective perms = role ∪ overrides; created user can log in (dev). Frontend: dialog validation, greyed non-grantable overrides. Regression.
- **security-reviewer**: per-user grant can't bypass delegation; platform-role assignment locked to SUPER_ADMIN; user_permission RLS/org-scope; initialPassword handling (hashed, dev-only, never logged).

## 5f. Increment 1.4 — Master-data CRUD + full User CRUD (added 2026-05-29)
User wants: (1) full CRUD for the dropdown/reference data FIRST, then (2) full user CRUD (Create+Edit+Delete) with all needed user/profile fields, FK/constrained fields as dropdowns.

### Phase A — Reference / Master Data CRUD (do FIRST)
Single generic table (less code than 5 modules, same capability):
- `auth.reference_data` (id, category VARCHAR ['LANGUAGE','USER_TYPE','GENDER','STATE','COUNTRY'], code VARCHAR, name VARCHAR, parent_code VARCHAR NULL [STATE→COUNTRY], is_active BOOL default true, sort_order INT default 0, audit, soft-delete). Unique (category, code) WHERE deleted_at IS NULL.
- Seed: LANGUAGE(en,hi,bn); USER_TYPE(BUSINESS_OWNER,EMPLOYEE,STAFF,DATA_ENTRY_OPERATOR); GENDER(MALE,FEMALE,OTHER,PREFER_NOT_TO_SAY); STATE = 28 states + 8 UTs (parent_code='IN'); COUNTRY (at least IN; include a reasonable ISO set, default IN).
- New permission `platform.refdata.manage` (seed into catalog + grant to SUPER_ADMIN).
- backend: `GET /auth/reference-data?category=&activeOnly=` (read; auth-only, used by dropdowns), `POST /auth/reference-data` / `PUT /auth/reference-data/{id}` / `DELETE /auth/reference-data/{id}` (CRUD, [RequiresPermission platform.refdata.manage]); validation (category enum, code format, uniqueness, parent_code must exist for STATE). 409 in-use guard on delete if referenced.
- ui-ux: "Reference Data" management screen (tabbed by category; table + Create/Edit/Deactivate; State tab shows Country parent). Reuse catalog/table patterns + tokens.
- frontend: route e.g. `/settings/reference-data`, nav-gated by platform.refdata.manage; client fns; @/i18n t(); TanStack Query.
- qa + security (gating, validation, in-use delete guard).

### Phase B — Full User CRUD (AFTER Phase A is verified)
- Extend Add User dialog + CreateUserAdminCommand to capture/persist ALL user+profile fields: preferred_language (dropdown ← refdata LANGUAGE), user_type (dropdown ← USER_TYPE), is_active (toggle), profile block: pan_number, aadhaar_last4, date_of_birth, gender (dropdown ← GENDER), address_line1/2, city, state (dropdown ← STATE, filtered by country), pincode, country (dropdown ← COUNTRY default IN). Keep role/org/permission-override pickers. PAN encrypted at rest (SEC-013 AesPanEncryptionService). Validate PAN/Aadhaar/pincode formats.
- backend: extend create; add `PUT /auth/admin/users/{id}` (UpdateUserAdminCommand — edit profile/role/permissions/status, delegation-enforced) + `DELETE /auth/admin/users/{id}` (soft-delete/deactivate, guard self-delete + last-super-admin). 
- frontend: Edit User dialog (prefilled), Delete/deactivate action on the Users list/detail; wire all fields + dropdowns from refdata.
- qa + security (escalation still enforced on edit; PAN encryption; self/last-admin delete guard).

## 6. Comms
- Pipeline: (db-engineer ∥ ui-ux-agent) → backend-agent → frontend-dev → qa-web → security-reviewer.
- All agents report completion to **orchestrator** (not the user) via SendMessage with a `summary`.
- File ownership boundaries are strict (see CLAUDE.md). No cross-agent edits.
