using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Roles.Commands.DeleteOrgRole;

/// <summary>Soft-deletes (deactivates) an org-scoped custom role.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgRolesDelete)]
public record DeleteOrgRoleCommand(Guid RoleId) : ICommand;

public sealed class DeleteOrgRoleCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<DeleteOrgRoleCommand>
{
    public async Task<Result> Handle(
        DeleteOrgRoleCommand request,
        CancellationToken cancellationToken)
    {
        var isSuperAdmin = currentUser.HasPermission(AuthService.Domain.Permissions.PlatformRolesManage);
        var orgId = currentUser.OrganizationId;

        var role = await db.Roles
            .FirstOrDefaultAsync(r => r.Id == request.RoleId && r.DeletedAt == null, cancellationToken);

        if (role is null)
            return Result.Failure(Error.NotFound("Role", request.RoleId));

        if (role.IsSystemRole)
            return Result.Failure(Error.Forbidden("Role.SystemRoleReadOnly", "System roles cannot be deleted."));

        if (!isSuperAdmin && role.OrganizationId != orgId)
            return Result.Failure(Error.Forbidden("Role.AccessDenied", "You can only delete roles within your own organization."));

        // Prevent deletion if members are actively assigned to this role
        var hasMembersAssigned = await db.OrganizationMembers
            .AnyAsync(m =>
                m.RoleId == request.RoleId &&
                m.IsActive &&
                m.DeletedAt == null,
                cancellationToken);

        if (hasMembersAssigned)
            return Result.Failure(Error.Conflict("Role.InUse", "Cannot delete a role that is currently assigned to active members. Reassign all members first."));

        role.Deactivate();
        role.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
