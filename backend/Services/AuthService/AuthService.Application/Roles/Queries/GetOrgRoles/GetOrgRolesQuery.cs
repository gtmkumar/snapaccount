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

        Dictionary<Guid, int> memberCounts = [];
        if (orgId.HasValue)
        {
            memberCounts = await db.OrganizationMembers
                .Where(m => m.OrganizationId == orgId.Value
                         && m.IsActive
                         && m.DeletedAt == null
                         && roleIds.Contains(m.RoleId))
                .GroupBy(m => m.RoleId)
                .Select(g => new { RoleId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.RoleId, x => x.Count, cancellationToken);
        }

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
