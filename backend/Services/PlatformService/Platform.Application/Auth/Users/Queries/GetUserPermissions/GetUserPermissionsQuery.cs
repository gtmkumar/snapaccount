using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Users.Queries.GetUserPermissions;

/// <summary>
/// Returns the effective PERMISSION CODES held by the authenticated user.
///
/// Effective set (Increment 1.3):
///   1. Platform role permissions (user_role → role → role_permission → permission)
///   2. Org-membership role permissions (organization_member → role_permission → permission)
///   3. Direct user_permission grants WHERE org_id IS NULL OR = active org  [NEW in I1.3]
///   4. JWT claim permissions (LOCAL_AUTH / dev tokens)
///
/// Retired (is_active=false) and soft-deleted permissions are excluded from all legs.
/// </summary>
public record GetUserPermissionsQuery : IQuery<UserPermissionsDto>;

/// <summary>Response DTO matching the teamApi.ts PermissionsSchema.</summary>
public record UserPermissionsDto(
    string UserId,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions);

public sealed class GetUserPermissionsQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetUserPermissionsQuery, UserPermissionsDto>
{
    public async Task<Result<UserPermissionsDto>> Handle(
        GetUserPermissionsQuery request,
        CancellationToken cancellationToken)
    {
        // SUPER_ADMIN wildcard — all live permissions only (retired excluded).
        if (currentUser.HasPermission("*"))
        {
            var allPerms = await db.Permissions
                .Where(p => p.IsActive && p.DeletedAt == null)
                .Select(p => p.Name)
                .ToListAsync(cancellationToken);

            return new UserPermissionsDto(
                currentUser.UserId.ToString(),
                currentUser.Roles.ToList(),
                allPerms);
        }

        // Shared resolver: role-based + direct grants (I1.3)
        var dbPerms = await EffectivePermissionResolver.ResolveAsync(
            db, currentUser.UserId, currentUser.OrganizationId, cancellationToken);

        // JWT claim permissions (LOCAL_AUTH / dev tokens). The JWT is a login-time snapshot,
        // so a permission RETIRED (is_active=false) or soft-deleted in the catalog after login
        // would otherwise leak back in via this leg — exclude any retired catalog perm here so
        // retirement takes effect live (perms not present in the catalog at all, e.g. pure dev
        // tokens, are still honoured).
        var retiredPerms = (await db.Permissions
            .Where(p => !p.IsActive || p.DeletedAt != null)
            .Select(p => p.Name)
            .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var jwtPerms = currentUser.Permissions.Where(p => p != "*" && !retiredPerms.Contains(p));

        var effectivePerms = dbPerms
            .Union(jwtPerms, StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p)
            .ToList();

        return new UserPermissionsDto(
            currentUser.UserId.ToString(),
            currentUser.Roles.ToList(),
            effectivePerms);
    }
}
