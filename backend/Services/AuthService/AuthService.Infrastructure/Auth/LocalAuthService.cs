using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Auth;

namespace AuthService.Infrastructure.Auth;

/// <summary>
/// LOCAL_AUTH dev login implementation: validates credentials against auth.user and
/// issues a locally-signed JWT carrying the user's roles + permissions.
/// SYSTEM_ADMIN users receive the "*" wildcard permission. NEVER used in prod.
/// </summary>
public sealed class LocalAuthService(
    AuthDbContext db,
    IConfiguration configuration,
    ILogger<LocalAuthService> logger) : ILocalAuthService
{
    private const string AdminEmail = "admin@snapaccount.local";
    private const string AdminPassword = "Admin@12345";
    private const string AdminRole = "SYSTEM_ADMIN";
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(12);

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

        var roles = await db.UserRoles
            .Where(ur => ur.UserId == user.Id && ur.IsActive && ur.DeletedAt == null)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name)
            .Distinct()
            .ToListAsync(ct);

        IReadOnlyList<string> permissions;
        if (roles.Contains(AdminRole, StringComparer.OrdinalIgnoreCase))
        {
            permissions = ["*"];
        }
        else
        {
            permissions = await db.UserRoles
                .Where(ur => ur.UserId == user.Id && ur.IsActive && ur.DeletedAt == null)
                .Join(db.RolePermissions, ur => ur.RoleId, rp => rp.RoleId, (ur, rp) => rp.PermissionId)
                .Join(db.Permissions, pid => pid, p => p.Id, (pid, p) => p.Name)
                .Distinct()
                .ToListAsync(ct);
        }

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var claims = new Dictionary<string, object?>
        {
            ["userId"] = user.Id.ToString(),
            ["organizationId"] = Guid.Empty.ToString(),
            ["roles"] = roles,
            ["permissions"] = permissions,
            ["email"] = user.Email,
            ["name"] = user.FullName,
            ["phone_number"] = user.PhoneNumber,
            ["firebase_uid"] = $"local:{user.Id}",
        };

        var token = LocalJwt.Issue(claims, Secret, TokenLifetime);
        return new LocalLoginResult(token, user.Id, user.Email!, user.FullName, roles, permissions);
    }

    public async Task EnsureDevAdminAsync(CancellationToken ct)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Name == AdminRole, ct);
        if (role is null)
        {
            role = Role.Create(AdminRole, "System Administrator", "Full access — LOCAL_AUTH dev seed.", isSystemRole: true);
            db.Roles.Add(role);
            await db.SaveChangesAsync(ct);
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == AdminEmail, ct);
        if (user is null)
        {
            user = new User { Email = AdminEmail, FullName = "Local Admin", PreferredLanguage = "en" };
            user.SetPasswordHash(PasswordHasher.Hash(AdminPassword));
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
            logger.LogWarning("LOCAL_AUTH: seeded dev admin {Email} (password: {Password}).", AdminEmail, AdminPassword);
        }
        else if (string.IsNullOrEmpty(user.PasswordHash))
        {
            user.SetPasswordHash(PasswordHasher.Hash(AdminPassword));
            await db.SaveChangesAsync(ct);
        }

        var hasRole = await db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == role.Id, ct);
        if (!hasRole)
        {
            db.UserRoles.Add(UserRole.Create(user.Id, role.Id));
            await db.SaveChangesAsync(ct);
        }
    }
}
