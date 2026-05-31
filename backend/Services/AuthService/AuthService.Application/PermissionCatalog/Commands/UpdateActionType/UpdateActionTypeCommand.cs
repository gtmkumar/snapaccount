using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Commands.UpdateActionType;

/// <summary>Renames / re-describes / (de)activates an action type (gap #3 mgmt). Key immutable.</summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record UpdateActionTypeCommand(Guid Id, string Name, string? Description, bool IsActive) : ICommand;

public sealed class UpdateActionTypeCommandValidator : AbstractValidator<UpdateActionTypeCommand>
{
    public UpdateActionTypeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}

public sealed class UpdateActionTypeCommandHandler(IAuthDbContext db) : ICommandHandler<UpdateActionTypeCommand>
{
    public async Task<Result> Handle(UpdateActionTypeCommand request, CancellationToken ct)
    {
        var at = await db.ActionTypes.FirstOrDefaultAsync(a => a.Id == request.Id && a.DeletedAt == null, ct);
        if (at is null) return Result.Failure(Error.NotFound("ActionType", request.Id));
        at.Update(request.Name.Trim(), request.Description);
        at.SetActive(request.IsActive);
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
