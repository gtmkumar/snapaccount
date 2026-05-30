using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Roles.Queries.GetOrgRoleDetail;

/// <summary>Returns detailed information including permissions for a single role.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgRolesRead)]
public record GetOrgRoleDetailQuery(Guid RoleId) : IQuery<OrgRoleDetailDto>;

/// <summary>Detailed role DTO including full permission objects.</summary>
public record OrgRoleDetailDto(
    Guid Id,
    string Name,
    string DisplayName,
    string? Description,
    bool IsSystemRole,
    Guid? OrganizationId,
    bool IsActive,
    IReadOnlyList<RolePermissionDto> Permissions);

/// <summary>Permission entry within a role detail view.</summary>
public record RolePermissionDto(
    Guid PermissionId,
    string Name,
    string Resource,
    string Action,
    string? Description);

public sealed class GetOrgRoleDetailQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetOrgRoleDetailQuery, OrgRoleDetailDto>
{
    public async Task<Result<OrgRoleDetailDto>> Handle(
        GetOrgRoleDetailQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        var isSuperAdmin = currentUser.HasPermission(AuthService.Domain.Permissions.PlatformRolesManage);

        var role = await db.Roles
            .Include(r => r.Permissions)
            .ThenInclude(rp => rp.Permission)
            .Where(r => r.Id == request.RoleId && r.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (role is null)
            return Error.NotFound("Role", request.RoleId);

        // Org isolation: caller must be SUPER_ADMIN or the role must belong to their org (or be a system role)
        if (!isSuperAdmin && role.OrganizationId.HasValue && role.OrganizationId != orgId)
            return Error.Forbidden("Role.AccessDenied", "You do not have access to this role.");

        var dto = new OrgRoleDetailDto(
            role.Id,
            role.Name,
            role.DisplayName,
            role.Description,
            role.IsSystemRole,
            role.OrganizationId,
            role.IsActive,
            role.Permissions
                .Where(rp => rp.Permission is not null && rp.DeletedAt == null)
                .Select(rp => new RolePermissionDto(
                    rp.PermissionId,
                    rp.Permission!.Name,
                    rp.Permission.Resource,
                    rp.Permission.Action,
                    rp.Permission.Description))
                .OrderBy(p => p.Name)
                .ToList());

        return Result<OrgRoleDetailDto>.Success(dto);
    }
}
