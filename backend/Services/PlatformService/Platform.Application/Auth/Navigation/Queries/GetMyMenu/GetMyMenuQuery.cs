using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Navigation.Queries.GetMyMenu;

/// <summary>
/// Returns the navigation menu the current user is allowed to see — the backend-
/// driven sidebar (gap #1 of the enhanced authz model). The menu is data
/// (auth.navigation_item + auth.menu_permission, migration 042) filtered by the
/// caller's effective permissions:
///   • an item with NO permission mapping is visible to all authenticated users;
///   • otherwise it shows when the caller holds ANY mapped permission (OR);
///   • the "*" wildcard matches everything (super-admin).
/// Self-scoped to the authenticated caller — no extra permission required, same as
/// GET /auth/me/permissions.
/// </summary>
public record GetMyMenuQuery : IQuery<IReadOnlyList<MenuNodeDto>>;

/// <summary>A menu entry plus its visible children (tree).</summary>
public record MenuNodeDto(
    string Key,
    string Label,
    string? IconKey,
    string Url,
    IReadOnlyList<MenuNodeDto> Children);

public sealed class GetMyMenuQueryHandler(IAuthDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetMyMenuQuery, IReadOnlyList<MenuNodeDto>>
{
    public async Task<Result<IReadOnlyList<MenuNodeDto>>> Handle(GetMyMenuQuery request, CancellationToken ct)
    {
        var perms = await EffectivePermissionResolver.ResolveAsync(
            db, currentUser.UserId, currentUser.OrganizationId, ct);
        var wildcard = perms.Contains("*");

        var items = await db.NavigationItems
            .Where(n => n.IsActive && n.DeletedAt == null)
            .OrderBy(n => n.DisplayOrder)
            .Select(n => new NavRow(n.Id, n.Key, n.ParentId, n.Label, n.IconKey, n.Url))
            .ToListAsync(ct);

        // menu_id → list of permission names that reveal it (only active perms count).
        var mappings = await db.MenuPermissions
            .Where(mp => mp.DeletedAt == null)
            .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                mp => mp.PermissionId, p => p.Id, (mp, p) => new { mp.MenuId, p.Name })
            .ToListAsync(ct);

        var requiredByMenu = mappings
            .GroupBy(x => x.MenuId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Name).ToList());

        bool Visible(Guid menuId) =>
            !requiredByMenu.TryGetValue(menuId, out var required)  // unmapped → public
            || wildcard
            || required.Any(perms.Contains);

        var childrenByParent = items
            .Where(i => i.ParentId.HasValue)
            .GroupBy(i => i.ParentId!.Value)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<NavRow>)g.ToList());

        // Build the tree from top-level items, keeping only visible nodes.
        List<MenuNodeDto> Build(IEnumerable<NavRow> level) =>
            level
                .Where(i => Visible(i.Id))
                .Select(i =>
                {
                    var kids = childrenByParent.TryGetValue(i.Id, out var c)
                        ? Build(c)
                        : new List<MenuNodeDto>();
                    return new MenuNodeDto(i.Key, i.Label, i.IconKey, i.Url, kids);
                })
                .ToList();

        var topLevel = items.Where(i => !i.ParentId.HasValue);
        return Result<IReadOnlyList<MenuNodeDto>>.Success(Build(topLevel));
    }

    private sealed record NavRow(Guid Id, string Key, Guid? ParentId, string Label, string? IconKey, string Url);
}
