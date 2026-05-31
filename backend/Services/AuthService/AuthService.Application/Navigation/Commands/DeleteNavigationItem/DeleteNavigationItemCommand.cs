using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Navigation.Commands.DeleteNavigationItem;

/// <summary>
/// Soft-deletes a navigation item and its permission mappings. Children are
/// re-parented to null (promoted to top level) rather than cascade-deleted.
/// SUPER_ADMIN (platform.permissions.manage).
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record DeleteNavigationItemCommand(Guid Id) : ICommand;

public sealed class DeleteNavigationItemCommandHandler(IAuthDbContext db)
    : ICommandHandler<DeleteNavigationItemCommand>
{
    public async Task<Result> Handle(DeleteNavigationItemCommand request, CancellationToken ct)
    {
        var item = await db.NavigationItems.FirstOrDefaultAsync(n => n.Id == request.Id && n.DeletedAt == null, ct);
        if (item is null)
            return Result.Failure(Error.NotFound("Navigation", request.Id));

        item.DeletedAt = DateTime.UtcNow;

        var maps = await db.MenuPermissions.Where(mp => mp.MenuId == item.Id && mp.DeletedAt == null).ToListAsync(ct);
        foreach (var mp in maps) mp.DeletedAt = DateTime.UtcNow;

        var children = await db.NavigationItems.Where(n => n.ParentId == item.Id && n.DeletedAt == null).ToListAsync(ct);
        foreach (var child in children)
            child.Update(child.Label, child.Url, child.IconKey, child.DisplayOrder, null, child.IsActive);

        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
