using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Navigation.Commands.UpdateNavigationItem;

/// <summary>
/// Edits a navigation item (Key immutable) and reconciles its permission mappings.
/// SUPER_ADMIN (platform.permissions.manage).
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record UpdateNavigationItemCommand(
    Guid Id,
    string Label,
    string Url,
    string? IconKey,
    int DisplayOrder,
    Guid? ParentId,
    bool IsActive,
    IReadOnlyList<Guid>? PermissionIds) : ICommand;

public sealed class UpdateNavigationItemCommandValidator : AbstractValidator<UpdateNavigationItemCommand>
{
    public UpdateNavigationItemCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Label).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Url).NotEmpty().MaximumLength(300);
        RuleFor(x => x.ParentId).Must((cmd, parent) => parent != cmd.Id)
            .WithMessage("A menu item cannot be its own parent.");
    }
}

public sealed class UpdateNavigationItemCommandHandler(IAuthDbContext db)
    : ICommandHandler<UpdateNavigationItemCommand>
{
    public async Task<Result> Handle(UpdateNavigationItemCommand request, CancellationToken ct)
    {
        var item = await db.NavigationItems.FirstOrDefaultAsync(n => n.Id == request.Id && n.DeletedAt == null, ct);
        if (item is null)
            return Result.Failure(Error.NotFound("Navigation", request.Id));

        item.Update(request.Label, request.Url, request.IconKey, request.DisplayOrder, request.ParentId, request.IsActive);

        // Reconcile menu_permission rows (replace set).
        var desired = (request.PermissionIds ?? []).Distinct().ToHashSet();
        var existing = await db.MenuPermissions
            .Where(mp => mp.MenuId == item.Id && mp.DeletedAt == null)
            .ToListAsync(ct);
        var existingIds = existing.Select(mp => mp.PermissionId).ToHashSet();

        foreach (var mp in existing.Where(mp => !desired.Contains(mp.PermissionId)))
            mp.DeletedAt = DateTime.UtcNow;
        foreach (var permId in desired.Where(id => !existingIds.Contains(id)))
            db.MenuPermissions.Add(MenuPermission.Create(item.Id, permId));

        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
