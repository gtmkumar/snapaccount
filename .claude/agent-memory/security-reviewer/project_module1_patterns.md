---
name: module1-auth-rbac-patterns
description: Security patterns and final gate verdict from Module 1 Auth/RBAC review + re-review (2026-05-29)
metadata:
  type: project
---

## Module 1 Auth/RBAC — Final Gate Verdict (Re-Review 2026-05-29)

**Gate: GO with conditions. HIGH: 1 (M1-R-001), MEDIUM: 1 (M1-R-002), LOW: 1, INFO: 2.**

Initial review was a timing artifact (code absent). Re-review confirmed full implementation.

### Re-Review Findings (Actual Code)

- M1-R-001 (HIGH — must fix before prod): `RlsSessionInterceptor` uses C# string interpolation to build `SET LOCAL app.current_user_id = '...'`. GUID format limits practical injection risk, but the pattern is categorically unsafe. Fix: replace with parameterized `SELECT set_config(@key, @val, true)` using `NpgsqlParameter`.
- M1-R-002 (MEDIUM — fix before go-live): `AcceptInvitationCommandHandler` does not verify `currentUser.Email == invitation.Email`. Any authenticated user who obtains the 256-bit token can accept the invite as themselves (IDOR on invitation acceptance identity). Add email match guard in the handler.
- M1-R-003 (LOW): `RlsSessionInterceptor` silently swallows failures — RLS degrades without observable alert. Add metric on catch block.
- M1-R-INFO-001: Public `GET /auth/invite/{token}` has no rate limiting — add rate limit policy.
- M1-R-INFO-002: `GetOrgMembersQuery` role filter accepts arbitrary string (low oracle risk).

### Delegation Controls Verified PASS

SetRolePermissions, CreateInvitation, UpdateOrgMember all enforce DB-resolved effective permission set intersection before mutation. Check is on server, separate from JWT claims, separate from `[RequiresPermission]` attribute.

### Invitation Token Security Verified PASS

256-bit CSPRNG (`RandomNumberGenerator.GetBytes(32)`), SHA-256 hex at rest, single-use status transition, 48h expiry, plaintext never logged.

### RLS Session Wiring Verified PASS

`RlsSessionInterceptor` registered as `DbConnectionInterceptor` in `DependencyInjection.cs` line 63. Sets both `app.current_user_id` and `app.is_platform_admin` on connection open. But see M1-R-001 for the injection risk in the SET command construction.

### Permissions Endpoint Verified PASS

`GetUserPermissionsQueryHandler` resolves real permission codes from `role_permission → permission` join. Returns `UserPermissionsDto` with dot-notation permission strings, not role names.

## Initial Module 1 Review Findings (Timing Artifacts — Now Resolved)

**Gate verdict at initial review: NO-GO. CRITICAL: 1, HIGH: 3, MEDIUM: 3, LOW: 2, INFO: 2.**

### Critical Pattern: Production Firebase Config Committed Despite .gitignore

`mobile/ios/SnapAccount/GoogleService-Info.plist` is committed and contains a live Firebase API key, GCM sender ID, and project ID. The `.gitignore` lists `GoogleService-Info.plist` as excluded but the file was added before the rule or via force-add. Firebase API key `AIzaSyBHXztHzLI38FZnV11PMQC89VvUlF3UKgE` and project `snapaccount-44625` are exposed. **Why:** gitignore rules do not retroactively remove already-tracked files. **How to apply:** On any new review, always verify whether files listed in .gitignore are actually tracked (`git ls-files <path>`). Require key rotation and git history rewrite before re-review.

### High Pattern: Empty Stub Directories — Backend Command Handlers Not Implemented

The entire Module 1 RBAC delegation enforcement surface was scaffolded as directory trees but handlers contain no `.cs` files. Specifically: `SetRolePermissions`, `CreateOrgRole`, `UpdateOrgRole`, `DeleteOrgRole`, `CreateInvitation`, `AcceptInvitation`, `ResendInvitation`, `RevokeInvitation`, `GetGrantablePermissions` — all empty. Only `GetOrgRoles` (read query) has implementation. No new API endpoints (`POST /auth/org/roles`, etc.) are registered. **Why:** Module 1 delivery was incomplete at security review gate time. **How to apply:** Before writing a gate verdict, enumerate all new directory structures and verify each contains `.cs` files. Empty handler directories = unimplemented feature = NO-GO.

### High Pattern: RLS Session Variable Never Set — All RLS Policies Silently Inactive

PostgreSQL RLS policies on all `auth.*` tables use `current_setting('app.current_user_id', TRUE)::UUID`. No application code (BaseDbContext, interceptors, middleware) ever executes `SET LOCAL app.current_user_id = '...'`. `current_setting` with the second arg `TRUE` returns NULL on missing setting; NULL UUID cast = NULL; equality with NULL = false in SQL. All RLS SELECT queries return zero rows to authenticated users; RLS provides no isolation. Same issue for `app.is_platform_admin`. **Why:** RLS requires an application-layer contract to set session variables; EF Core does not do this automatically. **How to apply:** Always grep backend code for `SET LOCAL app.` or `set_config` when RLS policies reference `current_setting`. Absence = RLS not functioning. Flag HIGH.

### High Pattern: GetUserPermissionsQuery Returns Role Names as Permission Codes

`GetUserPermissionsQueryHandler` returns `currentUser.Roles.ToList()` — role names like `["SYSTEM_ADMIN"]` — as the permissions list. The `/auth/me/permissions` endpoint is consumed by frontend permission gates expecting dotted codes like `"org.members.invite"`. `HasPermission("org.members.invite")` therefore returns false for all Firebase-authenticated users (role-name matching never matches a dotted permission string). Firebase users get 403 on all admin endpoints gated by permissions. LOCAL_AUTH users with `"*"` wildcard pass. **Why:** Phase 2 DB-backed permission resolution was never implemented; comment in code says "Phase 2 will expand roles". **How to apply:** When reviewing `GetUserPermissionsQuery`, verify it queries `auth.role_permission JOIN auth.permission` — not `currentUser.Roles`.

### Medium Pattern: LOCAL_AUTH JWT in localStorage — Production Guard Missing

`authToken.ts` stores the dev JWT in `localStorage`. `useAuth.ts` stores user profile in `localStorage`. XSS-accessible. More importantly: no server-side guard prevents `LOCAL_AUTH=true` from being set in staging. **How to apply:** Always check LOCAL_AUTH path for: (1) token storage location, (2) server-side environment guard in LocalAuthService/DI, (3) CI gate on env var.

### Medium Pattern: teamApi.ts Routes Do Not Match Backend Routes

Frontend calls `/auth/team/*` but backend implements `/auth/org/members/*`. 404 for all team management actions. **How to apply:** Cross-check frontend API client route paths against registered Minimal API endpoints in `Auth.cs` during any review that includes both layers.

### OTP Plaintext Logging in Non-Prod (Including Staging)

`OtpService.cs` logs plaintext OTP when `ASPNETCORE_ENVIRONMENT != "Production"`. Staging deployments emit OTPs to Cloud Logging. **How to apply:** Re-check this on future reviews — has it been restricted to `IsDevelopment()` only?

### All-Zeros PAN Encryption Placeholder Key in appsettings.json

`appsettings.json` `PanEncryption:Key` = base64 of 32 zero bytes. Trivially predictable. Any integration test using this key has decryptable PAN data. **How to apply:** On AesPanEncryptionService reviews, verify the placeholder key is a rejected sentinel, not a valid weak key.

### Confirmed Still-Open from Previous Phases (as of Module 1 review)

- NEW-002 (HIGH): Firebase revocation blocks account deletion — not yet fixed
- AES-CBC (NEW-003 LOW): PAN encryption still CBC, not GCM — not yet fixed
- Certificate pinning placeholder hashes (INFO-001): not yet replaced
- Firebase mock in mobile (INFO-007): not yet replaced with real SDK
- SEC-030/031/032/041 deferred: still open

**Why:** These were identified in Phase 5/6 and carried forward. Check for fixes on any re-audit.
