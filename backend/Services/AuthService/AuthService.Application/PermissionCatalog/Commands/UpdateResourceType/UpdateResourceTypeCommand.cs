using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Commands.UpdateResourceType;

/// <summary>Renames / re-describes / (de)activates a resource type (gap #3 mgmt). Key immutable.</summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record UpdateResourceTypeCommand(Guid Id, string Name, string? Description, bool IsActive) : ICommand;

public sealed class UpdateResourceTypeCommandValidator : AbstractValidator<UpdateResourceTypeCommand>
{
    public UpdateResourceTypeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}

public sealed class UpdateResourceTypeCommandHandler(IAuthDbContext db) : ICommandHandler<UpdateResourceTypeCommand>
{
    public async Task<Result> Handle(UpdateResourceTypeCommand request, CancellationToken ct)
    {
        var rt = await db.ResourceTypes.FirstOrDefaultAsync(r => r.Id == request.Id && r.DeletedAt == null, ct);
        if (rt is null) return Result.Failure(Error.NotFound("ResourceType", request.Id));
        rt.Update(request.Name.Trim(), request.Description);
        rt.SetActive(request.IsActive);
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
