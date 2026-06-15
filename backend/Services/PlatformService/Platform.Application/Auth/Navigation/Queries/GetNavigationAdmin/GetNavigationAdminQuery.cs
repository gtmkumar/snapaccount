using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Navigation.Queries.GetNavigationAdmin;

/// <summary>
/// Full navigation catalog for the Menu Management admin screen — every item
/// (active + inactive), each with the permission ids that reveal it. Ordered by
/// display order. SUPER_ADMIN (platform.permissions.manage).
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record GetNavigationAdminQuery : IQuery<IReadOnlyList<NavigationItemAdminDto>>;

public record NavigationItemAdminDto(
    Guid Id,
    string Key,
    Guid? ParentId,
    string Label,
    string? IconKey,
    string Url,
    int DisplayOrder,
    bool IsActive,
    IReadOnlyList<Guid> PermissionIds);

public sealed class GetNavigationAdminQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetNavigationAdminQuery, IReadOnlyList<NavigationItemAdminDto>>
{
    public async Task<Result<IReadOnlyList<NavigationItemAdminDto>>> Handle(GetNavigationAdminQuery request, CancellationToken ct)
    {
        var items = await db.NavigationItems
            .Where(n => n.DeletedAt == null)
            .OrderBy(n => n.DisplayOrder)
            .Select(n => new { n.Id, n.Key, n.ParentId, n.Label, n.IconKey, n.Url, n.DisplayOrder, n.IsActive })
            .ToListAsync(ct);

        var maps = await db.MenuPermissions
            .Where(mp => mp.DeletedAt == null)
            .Select(mp => new { mp.MenuId, mp.PermissionId })
            .ToListAsync(ct);
        var permsByMenu = maps.GroupBy(m => m.MenuId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<Guid>)g.Select(x => x.PermissionId).ToList());

        var dto = items.Select(n => new NavigationItemAdminDto(
            n.Id, n.Key, n.ParentId, n.Label, n.IconKey, n.Url, n.DisplayOrder, n.IsActive,
            permsByMenu.TryGetValue(n.Id, out var p) ? p : [])).ToList();

        return Result<IReadOnlyList<NavigationItemAdminDto>>.Success(dto);
    }
}
