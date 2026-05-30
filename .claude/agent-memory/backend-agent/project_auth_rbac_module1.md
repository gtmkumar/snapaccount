---
name: auth-rbac-module1
description: Auth/RBAC Module 1 backend implementation — org roles, permission matrix, delegation rule, invitations, RLS fix
metadata:
  type: project
---

## Auth/RBAC Module 1 backend complete (2026-05-29)

**Why:** Multi-tenant RBAC with constrained delegation for SnapAccount admin portal. Scope from `.claude/orchestrator/auth-rbac-module-scope.md`.

**Schema additions (migration 035+036):**
- `auth.role`: added `organization_id UUID NULL` (FK→auth.organization), `created_by_user_id UUID NULL`
- `auth.invitation`: new table (id, org_id, email, phone_number, role_id, invited_by_user_id, token_hash VARCHAR(256) UNIQUE, status ENUM, expires_at, accepted_at, accepted_user_id)
- 74 permissions seeded; 6 system roles seeded (SUPER_ADMIN→74, ORG_ADMIN→65, CA→31, MANAGER→20, REVIEWER→11, HR→6)

**New files under backend/Services/AuthService:**
- Domain: `Entities/Invitation.cs`, `Entities/Role.cs` (updated + org scoping), `Domain/Permissions.cs` (constants), `Events/InvitationCreatedEvent.cs`
- Application: Role CRUD (GetOrgRoles, GetOrgRoleDetail, CreateOrgRole, UpdateOrgRole, DeleteOrgRole, SetRolePermissions)
  - Permission catalog (PermissionCatalog/ namespace — renamed to avoid collision with Application.Permissions namespace): GetPermissionCatalog, GetGrantablePermissions
  - Members: GetOrgMembers, UpdateOrgMember, SuspendOrgMember, ReactivateOrgMember, RemoveOrgMember
  - Invitations: CreateInvitation, AcceptInvitation, ResendInvitation, RevokeInvitation, GetOrgInvites, ValidateInviteToken
  - PlatformAdmin: ListPlatformOrganizations, SuspendOrganization
- Infrastructure: InvitationConfiguration.cs, InvitationRepository.cs, RlsSessionInterceptor.cs (SEC-RLS-001)
- Api Endpoints: OrgRoles.cs, Permissions.cs (PermissionsEndpoints class), OrgMembers.cs, Invitations.cs, PlatformAdmin.cs

**Critical design decisions:**
1. `Permissions` folder renamed to `PermissionCatalog` to avoid namespace collision with `AuthService.Domain.Permissions` static class
2. `GetUserPermissionsQuery` now returns permission CODES (not role names) — expanded from DB via UserRole→RolePermission→Permission join
3. `RlsSessionInterceptor` is a `DbConnectionInterceptor` that sets `SET LOCAL app.current_user_id` and `app.is_platform_admin` on every connection open (SEC-RLS-001)
4. Delegation rule enforced in: `SetRolePermissionsCommand`, `UpdateOrgMemberCommand`, `CreateInvitationCommand` — cross-references caller's effective permissions from DB
5. Frontend routes match `teamApi.ts` exactly: `/auth/team/*` (not `/auth/org/members/*`)
6. Invitation token: 256-bit URL-safe base64; SHA-256 hex stored in DB; `CreateInvitationCommandHandler.HashToken()` is the canonical hash utility

**How to apply:**
- When adding new org-scoped commands, use `role.OrganizationId == caller.OrganizationId` check + `isSuperAdmin` bypass pattern
- Non-generic `Result` handlers: use `Result.Failure(Error.X)` not bare `Error.X` — no implicit cast
- Multi-line `return Error.X(...)` → `return Result.Failure(Error.X(...))`
- Permission constants: always use `AuthService.Domain.Permissions.X` (fully qualified) in `[RequiresPermission(...)]` attributes since the PermissionCatalog namespace can shadow

**Increment 1.4 Phase A (scope §5f, 2026-05-29) — ReferenceData:**
- Migration 039: `auth.reference_data` table. `ReferenceData` entity + `ReferenceDataCategory` constants + EF config. NAMESPACE CAUTION: the Application CQRS namespace is `AuthService.Application.ReferenceData.*` — use `using ReferenceDataEntity = AuthService.Domain.Entities.ReferenceData;` alias in commands that sit under that namespace to avoid the collision.
- `Permissions.PlatformRefDataManage = "platform.refdata.manage"` added to domain constants.
- 4 CQRS handlers: `GetReferenceDataQuery` (no perm — any auth user), `CreateReferenceDataCommand`, `UpdateReferenceDataCommand`, `DeleteReferenceDataCommand` (last three require `platform.refdata.manage`).
- `ReferenceDataEndpoints` endpoint group at `/auth/reference-data`. `GET ?category=&activeOnly=true|false`. POST/PUT/DELETE require SUPER_ADMIN.
- Validators: category ∈ {LANGUAGE,USER_TYPE,GENDER,STATE,COUNTRY}; code `^[A-Za-z0-9_-]+$`; STATE requires valid active COUNTRY parentCode → 400. Duplicate (category,code) → 409. In-use delete → 409 with count.
- IDbContext + AuthDbContext + `IAuthDbContext.ReferenceData` wired. 35 new tests (276 total).

**Increment 1.3 (scope §5e, 2026-05-29) — UserPermission direct grants + admin user create:**
- Migration 038: `auth.user_permission` table. `UserPermission` entity + EF config. Unique partial index via COALESCE (functional, owned by migration; EF declares supporting indexes only).
- `EffectivePermissionResolver.ResolveAsync` in `Application/Common/Helpers/` — single source of truth for 3-leg union: platform-role perms ∪ org-member-role perms ∪ direct user_permission grants. Applied to all 4 call-sites (GetUserPermissions, GetGrantablePermissions, SetRolePermissions delegation guard, LocalAuthService.LoginAsync).
- `IPasswordHasher` interface in Application; `PasswordHasherAdapter` in Infrastructure wraps static `PasswordHasher`; registered as singleton.
- `POST /auth/admin/users` (`CreateUserAdminCommand`): creates User+Profile+Preferences; scope=platform assigns UserRole, scope=org assigns OrganizationMember; direct permission overrides inserted as `UserPermission` rows; DELEGATION enforced (role perms ⊆ caller set, override perms ⊆ caller set); non-SUPER_ADMIN blocked from system roles.
- `GET /auth/admin/assignable-roles?scope=platform|org` (`GetAssignableRolesQuery`): returns only roles whose perms ⊆ caller's effective set.
- `IDbContext.UserPermissions` added; `AuthDbContext` wired.
- 17 new tests (241 total).

**Increment 1.2 (scope §5d, 2026-05-29) — Permission is_active lifecycle:**
- Migration 037: `auth.permission.is_active BOOLEAN NOT NULL DEFAULT true`. Both filters always apply: `is_active=true AND deleted_at IS NULL` = live. Retired = `is_active=false AND deleted_at IS NULL`.
- `Permission.IsActive` + `SetActive(bool)` domain method added. `Permission.Create` defaults `IsActive=true`.
- EF config: `builder.Property(p => p.IsActive).HasColumnName("is_active")`. Uniqueness index renamed `ix_permission_name_ci` (I1.1-002).
- `GetPermissionCatalogQuery(IncludeInactive=false)`: default excludes retired; `includeInactive=true` includes them. `PermissionDto` gains `IsActive` + `RoleCount` (LEFT JOIN active role grants). Endpoint: `GET /auth/permissions?includeInactive=true`.
- `GetGrantablePermissionsQuery` + `GetUserPermissionsQuery` + `SetRolePermissions` delegation resolver: all `Join(db.Permissions)` now filter `p.IsActive && p.DeletedAt == null`.
- `UpdatePermissionCommand`: adds `bool? IsActive` field. Allows retire + re-activate via `permission.SetActive(...)`. Null = no change.
- `DeletePermissionCommand` (I1.1-001): keeps 409 block on active grants; on successful delete, hard-deletes any soft-deleted `role_permission` tombstones for the permission to prevent orphan rows.
- `CreatePermissionCommand` (I1.1-002): uniqueness check is now case-insensitive (`p.Name.ToLower() == nameLower`).
- 44 new tests (224 total). `UpdatePermissionRequest` DTO gains `bool? IsActive` field.

**Tasks A+B (scope §5c, 2026-05-29):**
- TASK A: `OrgContextGuard.ValidateAsync` in `Application/Common/Guards/`. Applied to 5 handlers: `CreateOrgRole`, `SetRolePermissions`, `CreateInvitation`, `UpdateOrgMember`, `SuspendOrgMember`, `RemoveOrgMember`. Guard: (1) non-null non-empty OrgId, (2) org row exists, (3) caller has active membership (skipped for SUPER_ADMIN). Error code `Org.InvalidContext` → HTTP 409. Eliminates PostgresException 23503 FK violation → 500.
- TASK B: Permission catalog write endpoints (platform.permissions.manage required): `POST /auth/permissions` (create, 201), `PUT /auth/permissions/{id}` (update description, 204, name immutable), `DELETE /auth/permissions/{id}` (soft-delete, 204, blocks 409 if `N` active role grants). Name validation: `^[a-z0-9_]+(\.[a-z0-9_]+)+$`. Resource = first dot segment, action = rest. `Permission.UpdateDescription()` added to domain entity. 25 new tests (180 total).

**Fix batch applied (2026-05-29):**
- DEV_LIMITED_MANAGER seeding: `manager@snapaccount.local` / `Manager@12345` seeded with 7 permissions. Constants in `AuthService.Application.Common.DevSeed.LocalAuthDevSeed`. **CRITICAL FIX**: Step 5 (dev org INSERT) was using `ExecuteSqlRawAsync(sql, DevOrgId, adminUser.Id, ct)` — the `params object[]` overload consumed `ct` as a SQL parameter → `InvalidOperationException: no store type for CancellationToken`. Fixed by switching to `ExecuteSqlAsync(FormattableString, ct)` which uses the interpolated-string overload and passes `ct` as a distinct arg, not into the params array. Verified clean startup: 7 role_permission rows inserted, manager login returns non-wildcard permissions claim, `organizationId = 11111111-1111-1111-1111-111111111111`.
- BUG-E2E-INVITE-500: `InvitationConfiguration` had `HasConversion<string>()` which writes PascalCase ("Pending"). DB CHECK requires UPPERCASE ("PENDING"). Fixed with explicit converter: `v => v.ToString().ToUpperInvariant()` / `v => Enum.Parse<InvitationStatus>(v, ignoreCase: true)`. 9 unit tests added.
- BUG-DEVSEED-ORDER: `EnsureDevAdminAsync` restructured — every step (roles, user, UserRole, dev org, org membership) now has its own independent existence guard. Step 5 (dev org) always runs `ExecuteSqlRawAsync … ON CONFLICT DO NOTHING` unconditionally (no `AnyAsync` gate) — self-heals on existing DBs. Step 6 has its own `AnyAsync` guard. No step depends on a prior step having just created a row in the same invocation.
- Invite expiry: standardised to **72 hours** in both `CreateInvitationCommand` and `ResendInvitationCommand`. Frontend should use 72h.
- BUG-RBAC-E2E-001: `LocalAuthService.EnsureDevAdminAsync` seeds dev org UUID `11111111-1111-1111-1111-111111111111` ("Local Dev Org") via `ExecuteSqlRawAsync … ON CONFLICT DO NOTHING`, adds dev admin as ORG_ADMIN member, emits real UUID (not `Guid.Empty`) in JWT. `LocalAuthService.DevOrgId` is a public constant.
- M1-R-001: `RlsSessionInterceptor` uses `SELECT set_config('app.current_user_id', @uid, true)` with `NpgsqlParameter` — no string interpolation of user-controlled values.
- M1-R-002: `AcceptInvitationCommandHandler` now checks `callerEmail == invitation.Email` (OrdinalIgnoreCase) OR `callerPhone == invitation.PhoneNumber`. Returns `403 Invitation.IdentityMismatch` on mismatch. 7 pure-logic unit tests added.
- M1-R-003: `RlsSessionInterceptor` catch block now logs `LogWarning` with exception (previously silent).
- M1-R-INFO-001: `GET /auth/invite/{token}` uses `.RequireRateLimiting("invite-token-lookup")` (20 req/min fixed window).
- M1-R-INFO-002: `GetOrgMembersQueryValidator` — role filter `^[A-Za-z0-9_\-]+$` ≤100 chars; status must be "active"|"suspended"; page/pageSize bounded 1–100.
- Removed unused `db` params from 3 handlers — 0 CS9113 warnings.

Related: [[project_auth_architecture]], [[project_security_phase6b6d_hotfix]]
