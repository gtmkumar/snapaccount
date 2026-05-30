using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Commands.DeletePermission;

/// <summary>
/// Soft-deletes a catalog permission (SUPER_ADMIN only).
///
/// I1.1-001 behaviour:
///   • BLOCKED (409 Conflict) when the permission is actively granted to one or more roles.
///     The admin must remove the grants first. The response includes the grant count.
///   • On success (zero active grants): soft-deletes the permission row AND
///     hard-deletes any lingering soft-deleted <c>role_permission</c> tombstones for this
///     permission, ensuring no orphaned grant rows remain after the permission is deleted.
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record DeletePermissionCommand(Guid PermissionId) : ICommand;

public sealed class DeletePermissionCommandHandler(IAuthDbContext db)
    : ICommandHandler<DeletePermissionCommand>
{
    public async Task<Result> Handle(
        DeletePermissionCommand request,
        CancellationToken cancellationToken)
    {
        var permission = await db.Permissions
            .FirstOrDefaultAsync(p => p.Id == request.PermissionId && p.DeletedAt == null, cancellationToken);

        if (permission is null)
            return Result.Failure(Error.NotFound("Permission", request.PermissionId));

        // 409 block: active grants must be removed before deletion.
        var activeGrantCount = await db.RolePermissions
            .CountAsync(rp => rp.PermissionId == request.PermissionId && rp.DeletedAt == null, cancellationToken);

        if (activeGrantCount > 0)
            return Result.Failure(Error.Conflict(
                "Permission.InUse",
                $"This permission is currently granted to {activeGrantCount} role(s). " +
                "Remove the grants from all roles before deleting the permission."));

        // Soft-delete the permission.
        permission.DeletedAt = DateTime.UtcNow;

        // I1.1-001: hard-delete any soft-deleted role_permission tombstones for this
        // permission so no orphaned grant rows survive after the permission is gone.
        var staleGrants = await db.RolePermissions
            .Where(rp => rp.PermissionId == request.PermissionId && rp.DeletedAt != null)
            .ToListAsync(cancellationToken);

        if (staleGrants.Count > 0)
            db.RolePermissions.RemoveRange(staleGrants);

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
