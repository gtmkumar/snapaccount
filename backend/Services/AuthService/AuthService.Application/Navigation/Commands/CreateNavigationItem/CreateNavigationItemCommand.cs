using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Navigation.Commands.CreateNavigationItem;

/// <summary>
/// Adds a navigation (menu) item + its permission mappings (Menu Management).
/// A menu with no permission mappings is visible to all authenticated users.
/// SUPER_ADMIN (platform.permissions.manage).
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record CreateNavigationItemCommand(
    string Key,
    string Label,
    string Url,
    string? IconKey,
    int DisplayOrder,
    Guid? ParentId,
    IReadOnlyList<Guid>? PermissionIds) : ICommand<Guid>;

public sealed class CreateNavigationItemCommandValidator : AbstractValidator<CreateNavigationItemCommand>
{
    public CreateNavigationItemCommandValidator()
    {
        RuleFor(x => x.Key).NotEmpty().MaximumLength(100)
            .Matches(@"^[a-z0-9_.]+$")
            .WithMessage("Key must be lowercase letters, digits, underscores or dots.");
        RuleFor(x => x.Label).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Url).NotEmpty().MaximumLength(300);
    }
}

public sealed class CreateNavigationItemCommandHandler(IAuthDbContext db)
    : ICommandHandler<CreateNavigationItemCommand, Guid>
{
    public async Task<Result<Guid>> Handle(CreateNavigationItemCommand request, CancellationToken ct)
    {
        var exists = await db.NavigationItems.AnyAsync(n => n.Key == request.Key && n.DeletedAt == null, ct);
        if (exists)
            return Error.Conflict("Navigation.Duplicate", $"A menu item with key '{request.Key}' already exists.");

        var item = NavigationItem.Create(request.Key, request.Label, request.Url,
            request.IconKey, request.DisplayOrder, request.ParentId);
        db.NavigationItems.Add(item);

        foreach (var permId in (request.PermissionIds ?? []).Distinct())
            db.MenuPermissions.Add(MenuPermission.Create(item.Id, permId));

        await db.SaveChangesAsync(ct);
        return Result<Guid>.Success(item.Id);
    }
}
