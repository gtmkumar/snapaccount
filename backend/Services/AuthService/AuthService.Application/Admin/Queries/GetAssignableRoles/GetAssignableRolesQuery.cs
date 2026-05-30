using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetAssignableRoles;

/// <summary>
/// Returns the roles the caller may assign, for a given scope.
///
/// scope = "platform" → SUPER_ADMIN only: all system roles (is_system_role=true, org_id IS NULL)
///                      whose permission set ⊆ caller's effective set.
/// scope = "org"      → all roles visible in the caller's org (system roles + org custom roles)
///                      whose permission set ⊆ caller's effective set.
///
/// Used by the "Create User" dialog role dropdown so it only shows roles
/// the caller is actually allowed to assign.
/// </summary>
[RequiresPermission(Permissions.PlatformAdminsInvite)]
public record GetAssignableRolesQuery(string Scope) : IQuery<IReadOnlyList<AssignableRoleDto>>;

/// <summary>Minimal role DTO for the assignment dropdown.</summary>
public record AssignableRoleDto(
    Guid Id,
    string Name,
    string DisplayName,
    bool IsSystemRole,
    int PermissionCount);

public sealed class GetAssignableRolesQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetAssignableRolesQuery, IReadOnlyList<AssignableRoleDto>>
{
    public async Task<Result<IReadOnlyList<AssignableRoleDto>>> Handle(
        GetAssignableRolesQuery request,
        CancellationToken cancellationToken)
    {
        var isSuperAdmin = currentUser.HasPermission("*")
                        || currentUser.HasPermission(Permissions.PlatformAdminsInvite);

        // Caller's effective permission names (used for delegation check below)
        HashSet<string> callerEffective = [];
        if (!currentUser.HasPermission("*"))
        {
            callerEffective = await EffectivePermissionResolver.ResolveAsync(
                db, currentUser.UserId, currentUser.OrganizationId, cancellationToken);
            callerEffective.UnionWith(currentUser.Permissions.Where(p => p != "*"));
        }

        IQueryable<Domain.Entities.Role> rolesQuery;
        if (request.Scope == "platform")
        {
            // Platform scope: only system roles
            if (!isSuperAdmin)
                return Error.Forbidden(
                    "Role.PlatformScopeRestricted",
                    "Only SUPER_ADMIN may assign platform-scope roles.");

            rolesQuery = db.Roles
                .Where(r => r.IsSystemRole && r.OrganizationId == null
                         && r.IsActive && r.DeletedAt == null);
        }
        else if (request.Scope == "org")
        {
            if (!currentUser.OrganizationId.HasValue)
                return Error.Forbidden("Role.NoOrg", "You must be a member of an organization.");

            var orgId = currentUser.OrganizationId.Value;
            rolesQuery = db.Roles
                .Where(r => r.IsActive && r.DeletedAt == null
                         && (r.OrganizationId == null || r.OrganizationId == orgId));
        }
        else
        {
            return Error.Validation("Role.InvalidScope", "Scope must be 'platform' or 'org'.");
        }

        var roles = await rolesQuery
            .Include(r => r.Permissions).ThenInclude(rp => rp.Permission)
            .OrderBy(r => r.IsSystemRole ? 0 : 1).ThenBy(r => r.DisplayName)
            .ToListAsync(cancellationToken);

        // Filter: only roles whose perms ⊆ caller's effective set (skip for wildcard)
        var assignable = roles
            .Where(role =>
            {
                if (currentUser.HasPermission("*")) return true;

                var rolePermNames = role.Permissions
                    .Where(rp => rp.DeletedAt == null && rp.Permission?.IsActive == true)
                    .Select(rp => rp.Permission!.Name);

                return rolePermNames.All(p =>
                    callerEffective.Contains(p, StringComparer.OrdinalIgnoreCase));
            })
            .Select(r => new AssignableRoleDto(
                r.Id, r.Name, r.DisplayName, r.IsSystemRole,
                r.Permissions.Count(rp => rp.DeletedAt == null)))
            .ToList();

        return Result<IReadOnlyList<AssignableRoleDto>>.Success(assignable);
    }
}
