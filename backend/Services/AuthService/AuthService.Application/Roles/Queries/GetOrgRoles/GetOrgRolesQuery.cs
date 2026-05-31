using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Roles.Queries.GetOrgRoles;

/// <summary>Returns all roles (system + org-custom) visible to the caller's organization.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgRolesRead)]
public record GetOrgRolesQuery : IQuery<IReadOnlyList<OrgRoleDto>>;

/// <summary>Read-only DTO for a role in the permission matrix list.</summary>
public record OrgRoleDto(
    Guid Id,
    string Name,
    string DisplayName,
    string? Description,
    bool IsSystemRole,
    bool IsActive,
    int MemberCount,
    IReadOnlyList<string> PermissionNames);

public sealed class GetOrgRolesQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetOrgRolesQuery, IReadOnlyList<OrgRoleDto>>
{
    public async Task<Result<IReadOnlyList<OrgRoleDto>>> Handle(
        GetOrgRolesQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // SUPER_ADMIN sees all roles; org users see system roles + their org's custom roles
        var isSuperAdmin = currentUser.HasPermission(AuthService.Domain.Permissions.PlatformRolesManage);

        var rolesQuery = db.Roles
            .Include(r => r.Permissions)
            .ThenInclude(rp => rp.Permission)
            .Where(r => r.DeletedAt == null && r.IsActive)
            .AsQueryable();

        if (!isSuperAdmin && orgId.HasValue)
        {
            // Org users see: system roles (NULL org) + their org's custom roles
            rolesQuery = rolesQuery.Where(r =>
                r.OrganizationId == null ||
                r.OrganizationId == orgId.Value);
        }

        var roles = await rolesQuery
            .OrderBy(r => r.IsSystemRole ? 0 : 1)
            .ThenBy(r => r.DisplayName)
            .ToListAsync(cancellationToken);

        // Count active members per role scoped to the caller's org
        var roleIds = roles.Select(r => r.Id).ToList();

        // "Members" = DISTINCT users holding the role via EITHER an active platform
        // user_role (e.g. SUPER_ADMIN / operational staff — assigned globally, not via
        // org membership) OR an active organization membership in the caller's org.
        // Counting only org members previously reported 0 for platform/system roles
        // even when staff held them via user_role (visible on the Team page).
        var membersByRole = new Dictionary<Guid, HashSet<Guid>>();
        void AddHolder(Guid roleId, Guid userId)
        {
            if (!membersByRole.TryGetValue(roleId, out var set))
                membersByRole[roleId] = set = [];
            set.Add(userId);
        }

        var userRoleHolders = await db.UserRoles
            .Where(ur => ur.IsActive && ur.DeletedAt == null && roleIds.Contains(ur.RoleId))
            .Select(ur => new { ur.RoleId, ur.UserId })
            .ToListAsync(cancellationToken);
        foreach (var h in userRoleHolders) AddHolder(h.RoleId, h.UserId);

        if (orgId.HasValue)
        {
            var orgMemberHolders = await db.OrganizationMembers
                .Where(m => m.OrganizationId == orgId.Value
                         && m.IsActive
                         && m.DeletedAt == null
                         && roleIds.Contains(m.RoleId))
                .Select(m => new { m.RoleId, m.UserId })
                .ToListAsync(cancellationToken);
            foreach (var h in orgMemberHolders) AddHolder(h.RoleId, h.UserId);
        }

        var memberCounts = membersByRole.ToDictionary(kv => kv.Key, kv => kv.Value.Count);

        IReadOnlyList<OrgRoleDto> dtos = roles.Select(r => new OrgRoleDto(
            r.Id,
            r.Name,
            r.DisplayName,
            r.Description,
            r.IsSystemRole,
            r.IsActive,
            memberCounts.GetValueOrDefault(r.Id, 0),
            r.Permissions
                .Where(rp => rp.Permission is not null && rp.DeletedAt == null)
                .Select(rp => rp.Permission!.Name)
                .OrderBy(p => p)
                .ToList()
        )).ToList();

        return Result<IReadOnlyList<OrgRoleDto>>.Success(dtos);
    }
}
