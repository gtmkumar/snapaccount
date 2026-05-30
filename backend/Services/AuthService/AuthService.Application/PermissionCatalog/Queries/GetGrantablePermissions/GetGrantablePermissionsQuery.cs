using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Queries.GetGrantablePermissions;

/// <summary>
/// Returns the subset of permissions the current caller may delegate.
/// I1.3: effective set now includes direct user_permission grants in addition to role-based grants.
/// Retired permissions (is_active=false) are NEVER grantable, even for SUPER_ADMIN.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgPermissionsRead)]
public record GetGrantablePermissionsQuery : IQuery<IReadOnlyList<Guid>>;

public sealed class GetGrantablePermissionsQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetGrantablePermissionsQuery, IReadOnlyList<Guid>>
{
    public async Task<Result<IReadOnlyList<Guid>>> Handle(
        GetGrantablePermissionsQuery request,
        CancellationToken cancellationToken)
    {
        var isSuperAdmin = currentUser.HasPermission(AuthService.Domain.Permissions.PlatformPermissionsManage)
                        || currentUser.HasPermission("*");

        var livePermissions = db.Permissions.Where(p => p.IsActive && p.DeletedAt == null);

        if (isSuperAdmin)
        {
            var allIds = await livePermissions.Select(p => p.Id).ToListAsync(cancellationToken);
            return Result<IReadOnlyList<Guid>>.Success(allIds);
        }

        // Caller's effective names via shared resolver (includes direct grants — I1.3)
        var callerPermNames = await EffectivePermissionResolver.ResolveAsync(
            db, currentUser.UserId, currentUser.OrganizationId, cancellationToken);
        callerPermNames.UnionWith(currentUser.Permissions.Where(p => p != "*"));

        var grantableIds = await livePermissions
            .Where(p => callerPermNames.Contains(p.Name))
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<Guid>>.Success(grantableIds);
    }
}
