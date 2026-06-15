using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Commands.SetUserActiveAdmin;

/// <summary>
/// Activates or deactivates a platform user (Team › Staff row action, Screen 87).
/// Flips <c>User.IsActive</c> only — roles, permission overrides and KYC profile are
/// untouched, so this is a reversible access toggle (unlike soft-delete).
///
/// GUARDS (deactivation only):
///   • Self-deactivate is refused (409 User.SelfDelete) — an admin cannot lock
///     themselves out through this path.
///   • Deactivating the last active wildcard ("*") SUPER_ADMIN is refused
///     (409 User.LastAdmin) — the platform must retain one reachable super-admin.
/// Reactivation (IsActive = true) is unguarded.
/// </summary>
[RequiresPermission(Permissions.PlatformAdminsInvite)]
public record SetUserActiveAdminCommand(Guid UserId, bool IsActive) : ICommand;

public sealed class SetUserActiveAdminCommandValidator : AbstractValidator<SetUserActiveAdminCommand>
{
    public SetUserActiveAdminCommandValidator() => RuleFor(x => x.UserId).NotEmpty();
}

public sealed class SetUserActiveAdminCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<SetUserActiveAdminCommand>
{
    public async Task<Result> Handle(SetUserActiveAdminCommand request, CancellationToken cancellationToken)
    {
        // Guards only apply when locking an account; reactivation is always safe.
        if (!request.IsActive)
        {
            if (request.UserId == currentUser.UserId)
                return Result.Failure(Error.Conflict(
                    "User.SelfDelete", "You cannot deactivate your own account."));
        }

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Id == request.UserId && !u.IsDeleted, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User", request.UserId));

        if (!request.IsActive)
        {
            // Last-admin guard — mirrors DeleteUserAdminCommand. Identify all users
            // currently holding the "*" wildcard via an active role assignment.
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
                        "Cannot deactivate the last active super-admin. Assign the wildcard role to another active user first."));
            }
        }

        // No-op short-circuit keeps the call idempotent.
        if (user.IsActive == request.IsActive)
            return Result.Success();

        user.SetActive(request.IsActive);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
