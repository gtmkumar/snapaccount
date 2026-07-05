using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Commands.UpdatePermission;

/// <summary>
/// Updates the mutable fields of a catalog permission (SUPER_ADMIN only).
///
/// Mutable fields:
///   • <see cref="Description"/> — replaces current description (null clears it)
///   • <see cref="IsActive"/>    — null = leave unchanged; false = RETIRE; true = RE-ACTIVATE
///
/// Immutable fields (name/resource/action): changing them would silently break every
/// <c>[RequiresPermission("name")]</c> decoration that references the old value.
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record UpdatePermissionCommand(
    Guid PermissionId,
    string? Description,
    bool? IsActive = null) : ICommand;

public sealed class UpdatePermissionCommandValidator : AbstractValidator<UpdatePermissionCommand>
{
    public UpdatePermissionCommandValidator()
    {
        RuleFor(x => x.PermissionId).NotEmpty();

        RuleFor(x => x.Description)
            .MaximumLength(500)
            .When(x => x.Description is not null);
    }
}

public sealed class UpdatePermissionCommandHandler(IAuthDbContext db)
    : ICommandHandler<UpdatePermissionCommand>
{
    public async Task<Result> Handle(
        UpdatePermissionCommand request,
        CancellationToken cancellationToken)
    {
        // Allow updating retired permissions too (so they can be re-activated).
        var permission = await db.Permissions
            .FirstOrDefaultAsync(p => p.Id == request.PermissionId && p.DeletedAt == null, cancellationToken);

        if (permission is null)
            return Result.Failure(Error.NotFound("Permission", request.PermissionId));

        permission.UpdateDescription(request.Description);

        if (request.IsActive.HasValue)
            permission.SetActive(request.IsActive.Value);

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
