using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Commands.DeleteUserAdmin;

/// <summary>
/// Soft-deletes a user (Phase B, Increment 1.4). Marks the user deleted + inactive
/// and deactivates their role assignments so they vanish from admin lists and can no
/// longer authenticate.
///
/// GUARDS:
///   • Self-delete is refused (409 User.SelfDelete) — an admin cannot remove their own
///     account through this path.
///   • Removing the last active wildcard ("*") SUPER_ADMIN is refused (409 User.LastAdmin)
///     — the platform must always retain at least one full super-admin.
/// </summary>
[RequiresPermission(Permissions.PlatformAdminsInvite)]
public record DeleteUserAdminCommand(Guid UserId) : ICommand;

public sealed class DeleteUserAdminCommandValidator : AbstractValidator<DeleteUserAdminCommand>
{
    public DeleteUserAdminCommandValidator() => RuleFor(x => x.UserId).NotEmpty();
}

public sealed class DeleteUserAdminCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<DeleteUserAdminCommand>
{
    public async Task<Result> Handle(DeleteUserAdminCommand request, CancellationToken cancellationToken)
    {
        // ── Self-delete guard ─────────────────────────────────────────────────
        if (request.UserId == currentUser.UserId)
            return Result.Failure(Error.Conflict(
                "User.SelfDelete", "You cannot delete your own account."));

        // ── Load target user (tracked) ────────────────────────────────────────
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Id == request.UserId && !u.IsDeleted, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User.NotFound", $"User {request.UserId} not found."));

        // ── Last-admin guard ──────────────────────────────────────────────────
        // Identify all users currently holding the "*" wildcard via an active role.
        var wildcardUserIds = await db.UserRoles
            .Where(ur => ur.IsActive && ur.DeletedAt == null)
            .Join(db.RolePermissions.Where(rp => rp.DeletedAt == null),
                ur => ur.RoleId, rp => rp.RoleId, (ur, rp) => new { ur.UserId, rp.PermissionId })
            .Join(db.Permissions.Where(p => p.Name == "*" && p.IsActive && p.DeletedAt == null),
                x => x.PermissionId, p => p.Id, (x, _) => x.UserId)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (wildcardUserIds.Contains(user.Id))
        {
            var activeWildcardAdmins = await db.Users
                .Where(u => wildcardUserIds.Contains(u.Id) && !u.IsDeleted && u.IsActive)
                .CountAsync(cancellationToken);

            if (activeWildcardAdmins <= 1)
                return Result.Failure(Error.Conflict(
                    "User.LastAdmin",
                    "Cannot delete the last active super-admin. Assign the wildcard role to another active user first."));
        }

        // ── Soft delete + deactivate role assignments ─────────────────────────
        user.AdminSoftDelete();

        var userRoles = await db.UserRoles
            .Where(ur => ur.UserId == user.Id && ur.IsActive && ur.DeletedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var ur in userRoles) ur.Deactivate();

        var memberships = await db.OrganizationMembers
            .Where(m => m.UserId == user.Id && m.IsActive && m.DeletedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var m in memberships) m.Deactivate();

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
