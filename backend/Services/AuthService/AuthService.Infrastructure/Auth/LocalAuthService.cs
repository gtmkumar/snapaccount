using AuthService.Application.Common.DevSeed;
using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Auth;

namespace AuthService.Infrastructure.Auth;

/// <summary>
/// LOCAL_AUTH dev login: validates credentials against auth.user and issues a locally-signed
/// JWT carrying the user's roles + permissions. NEVER used in staging or production.
///
/// Seeded dev accounts:
///   admin@snapaccount.local   / Admin@12345    → permissions ["*"], org: dev org (ORG_ADMIN)
///   manager@snapaccount.local / Manager@12345  → 7-permission limited set (DEV_LIMITED_MANAGER)
/// </summary>
public sealed class LocalAuthService(
    AuthDbContext db,
    IConfiguration configuration,
    IChallengeTokenService challengeTokenService,
    ILogger<LocalAuthService> logger) : ILocalAuthService
{
    private const string AdminEmail    = "admin@snapaccount.local";
    private const string AdminPassword = "Admin@12345";
    private const string AdminRole     = "SUPER_ADMIN";
    private const string OrgAdminRole  = "ORG_ADMIN";

    private const string ManagerEmail       = "manager@snapaccount.local";
    private const string ManagerPassword    = "Manager@12345";
    private const string ManagerRoleName    = "DEV_LIMITED_MANAGER";
    private const string ManagerDisplayName = "Dev Limited Manager";

    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(12);

    // Delegate to the shared Application-layer constants so unit tests (which cannot
    // reference Infrastructure) can assert the same values without a project-reference cycle.
    private static Guid DevOrgId => LocalAuthDevSeed.DevOrgId;
    private static IReadOnlyList<string> ManagerPermissions => LocalAuthDevSeed.ManagerPermissions;

    private string Secret =>
        configuration["LOCAL_AUTH:SECRET"]
        ?? Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET")
        ?? FirebaseAuthMiddleware.DefaultLocalSecret;

    public async Task<LocalLoginResult?> LoginAsync(string email, string password, CancellationToken ct)
    {
        var normalized = email.Trim().ToLowerInvariant();
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == normalized && u.IsActive, ct);

        if (user is null || !PasswordHasher.Verify(password, user.PasswordHash))
            return null;

        // Platform roles (from auth.user_role)
        var platformRoles = await db.UserRoles
            .Where(ur => ur.UserId == user.Id && ur.IsActive && ur.DeletedAt == null)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name)
            .Distinct()
            .ToListAsync(ct);

        // Org membership role names (for the JWT roles claim)
        var orgRoleNames = await db.OrganizationMembers
            .Where(m => m.UserId == user.Id && m.IsActive && m.DeletedAt == null)
            .Join(db.Roles, m => m.RoleId, r => r.Id, (m, r) => r.Name)
            .Distinct()
            .ToListAsync(ct);

        var allRoles = platformRoles.Union(orgRoleNames, StringComparer.OrdinalIgnoreCase).ToList();

        IReadOnlyList<string> permissions;
        if (platformRoles.Contains(AdminRole, StringComparer.OrdinalIgnoreCase))
        {
            // SUPER_ADMIN gets wildcard — no DB expansion needed.
            permissions = ["*"];
        }
        else
        {
            // I1.3: use the shared resolver (role-based + direct user_permission grants).
            var activeOrgId = orgRoleNames.Count > 0
                ? await db.OrganizationMembers
                    .Where(m => m.UserId == user.Id && m.IsActive && m.DeletedAt == null)
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => (Guid?)m.OrganizationId)
                    .FirstOrDefaultAsync(ct)
                : null;

            permissions = (await EffectivePermissionResolver.ResolveAsync(
                    db, user.Id, activeOrgId, ct))
                .OrderBy(p => p)
                .ToList();
        }

        // Resolve active org id; fall back to dev org.
        var orgMembership = await db.OrganizationMembers
            .Where(m => m.UserId == user.Id && m.IsActive && m.DeletedAt == null)
            .OrderByDescending(m => m.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var orgId = orgMembership?.OrganizationId ?? DevOrgId;

        // 2FA gate: if TOTP is enabled, return a challenge token instead of the JWT
        var hasTotpEnabled = await db.UserTotps
            .AnyAsync(t => t.UserId == user.Id && t.IsEnabled && t.DeletedAt == null, ct);
        if (hasTotpEnabled)
        {
            var challengeToken = challengeTokenService.Issue(user.Id);
            logger.LogInformation("LOCAL_AUTH: 2FA required for {Email} — challenge token issued.", email);
            return new LocalLoginResult(
                Token: null!,
                UserId: user.Id,
                Email: user.Email!,
                FullName: user.FullName,
                Roles: [],
                Permissions: [],
                Requires2fa: true,
                ChallengeToken: challengeToken);
        }

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var claims = new Dictionary<string, object?>
        {
            ["userId"]         = user.Id.ToString(),
            ["organizationId"] = orgId.ToString(),
            ["roles"]          = allRoles,
            ["permissions"]    = permissions,
            ["email"]          = user.Email,
            ["name"]           = user.FullName,
            ["phone_number"]   = user.PhoneNumber,
            ["firebase_uid"]   = $"local:{user.Id}",
        };

        var token = LocalJwt.Issue(claims, Secret, TokenLifetime);
        return new LocalLoginResult(token, user.Id, user.Email!, user.FullName, allRoles, permissions, Requires2fa: false);
    }

    /// <summary>
    /// Idempotently seeds the dev environment on every startup. Each step is independently
    /// guarded so the method self-heals on any existing DB state.
    ///
    /// Seeding order (all 10 steps always run — no early exit):
    ///   1  SUPER_ADMIN platform role
    ///   2  ORG_ADMIN system role
    ///   3  Dev admin user (admin@snapaccount.local)
    ///   4  SUPER_ADMIN UserRole for admin
    ///   5  Dev org row (fixed UUID 11111111-…)
    ///   6  Admin as ORG_ADMIN org member
    ///   7  DEV_LIMITED_MANAGER custom org role
    ///   8  Seed ManagerPermissions onto that role (idempotent per permission)
    ///   9  Manager user (manager@snapaccount.local)
    ///  10  Manager as DEV_LIMITED_MANAGER org member
    /// </summary>
    public async Task EnsureDevAdminAsync(CancellationToken ct)
    {
        // ── Step 1: SUPER_ADMIN platform role ───────────────────────────────────────
        var sysAdminRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == AdminRole, ct);
        if (sysAdminRole is null)
        {
            sysAdminRole = Role.Create(AdminRole, "System Administrator",
                "Full access — LOCAL_AUTH dev seed.", isSystemRole: true);
            db.Roles.Add(sysAdminRole);
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: seeded role {Role}.", AdminRole);
        }

        // ── Step 2: ORG_ADMIN system role ────────────────────────────────────────────
        var orgAdminRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == OrgAdminRole, ct);
        if (orgAdminRole is null)
        {
            orgAdminRole = Role.Create(OrgAdminRole, "Organisation Admin",
                "Full access to one organisation — LOCAL_AUTH dev seed.", isSystemRole: true);
            db.Roles.Add(orgAdminRole);
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: seeded role {Role}.", OrgAdminRole);
        }

        // ── Step 3: Dev admin user ────────────────────────────────────────────────────
        var adminUser = await db.Users.FirstOrDefaultAsync(u => u.Email == AdminEmail, ct);
        if (adminUser is null)
        {
            adminUser = new User { Email = AdminEmail, FullName = "Local Admin", PreferredLanguage = "en" };
            adminUser.SetPasswordHash(PasswordHasher.Hash(AdminPassword));
            db.Users.Add(adminUser);
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: seeded dev admin {Email}.", AdminEmail);
        }
        else if (string.IsNullOrEmpty(adminUser.PasswordHash))
        {
            adminUser.SetPasswordHash(PasswordHasher.Hash(AdminPassword));
            await db.SaveChangesAsync(ct);
        }

        // ── Step 4: SUPER_ADMIN UserRole for admin ───────────────────────────────────
        var hasSysRole = await db.UserRoles
            .AnyAsync(ur => ur.UserId == adminUser.Id && ur.RoleId == sysAdminRole.Id, ct);
        if (!hasSysRole)
        {
            db.UserRoles.Add(UserRole.Create(adminUser.Id, sysAdminRole.Id));
            await db.SaveChangesAsync(ct);
        }

        // ── Step 5: Dev organization (fixed UUID) ─────────────────────────────────────
        // BaseEntity.Id is protected set so we cannot use an object-initialiser with a
        // fixed Guid. We use ExecuteSqlAsync (FormattableString overload) which takes its
        // parameters from the interpolated holes {0} and passes `ct` as a distinct arg —
        // no overload ambiguity with CancellationToken. ON CONFLICT DO NOTHING makes it
        // safe to call every startup.
        var devOrgId  = DevOrgId;          // local copy — lambda capture of static prop
        var ownerUid  = adminUser.Id;      // local copy for clarity
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO auth.organization
                (id, owner_user_id, business_name, is_gst_registered, is_msme_registered,
                 is_active, country, created_at, updated_at)
            VALUES
                ({devOrgId}, {ownerUid}, 'Local Dev Org', false, false, true, 'India', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            ct);

        // ── Step 6: Admin as ORG_ADMIN org member ─────────────────────────────────────
        var adminHasOrgMembership = await db.OrganizationMembers
            .AnyAsync(m =>
                m.UserId == adminUser.Id &&
                m.OrganizationId == DevOrgId &&
                m.DeletedAt == null, ct);
        if (!adminHasOrgMembership)
        {
            db.OrganizationMembers.Add(OrganizationMember.Create(DevOrgId, adminUser.Id, orgAdminRole.Id));
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: admin → ORG_ADMIN in dev org {OrgId}.", DevOrgId);
        }

        // ── Step 7: DEV_LIMITED_MANAGER custom org role ───────────────────────────────
        var limitedRole = await db.Roles
            .FirstOrDefaultAsync(r => r.Name == ManagerRoleName && r.OrganizationId == DevOrgId, ct);
        if (limitedRole is null)
        {
            limitedRole = Role.CreateOrgRole(
                organizationId: DevOrgId,
                createdByUserId: adminUser.Id,
                name: ManagerRoleName,
                displayName: ManagerDisplayName,
                description: "LOCAL_AUTH demo role — limited permission set to show delegation greying.");
            db.Roles.Add(limitedRole);
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: seeded custom role {Role} in dev org.", ManagerRoleName);
        }

        // ── Step 8: Seed ManagerPermissions onto DEV_LIMITED_MANAGER ─────────────────
        foreach (var permName in ManagerPermissions)
        {
            var perm = await db.Permissions
                .FirstOrDefaultAsync(p => p.Name == permName && p.DeletedAt == null, ct);
            if (perm is null)
            {
                logger.LogWarning(
                    "LOCAL_AUTH: permission '{Perm}' not found in catalog — skipping grant on {Role}. " +
                    "Run the DB migration seed first.",
                    permName, ManagerRoleName);
                continue;
            }

            var alreadyGranted = await db.RolePermissions
                .AnyAsync(rp =>
                    rp.RoleId == limitedRole.Id &&
                    rp.PermissionId == perm.Id &&
                    rp.DeletedAt == null, ct);
            if (!alreadyGranted)
            {
                db.RolePermissions.Add(RolePermission.Create(limitedRole.Id, perm.Id));
                await db.SaveChangesAsync(ct);
            }
        }

        // ── Step 9: Manager user (manager@snapaccount.local) ─────────────────────────
        var managerUser = await db.Users.FirstOrDefaultAsync(u => u.Email == ManagerEmail, ct);
        if (managerUser is null)
        {
            managerUser = new User
            {
                Email             = ManagerEmail,
                FullName          = "Dev Manager",
                PreferredLanguage = "en",
            };
            managerUser.SetPasswordHash(PasswordHasher.Hash(ManagerPassword));
            db.Users.Add(managerUser);
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: seeded manager user {Email}.", ManagerEmail);
        }
        else if (string.IsNullOrEmpty(managerUser.PasswordHash))
        {
            managerUser.SetPasswordHash(PasswordHasher.Hash(ManagerPassword));
            await db.SaveChangesAsync(ct);
        }

        // ── Step 10: Manager as DEV_LIMITED_MANAGER org member ───────────────────────
        var managerHasOrgMembership = await db.OrganizationMembers
            .AnyAsync(m =>
                m.UserId == managerUser.Id &&
                m.OrganizationId == DevOrgId &&
                m.DeletedAt == null, ct);
        if (!managerHasOrgMembership)
        {
            db.OrganizationMembers.Add(
                OrganizationMember.Create(DevOrgId, managerUser.Id, limitedRole.Id));
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: manager → DEV_LIMITED_MANAGER in dev org {OrgId}.", DevOrgId);
        }
    }
}
