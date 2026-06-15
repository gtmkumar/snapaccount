using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Roles.Commands.UpdateOrgRole;

/// <summary>Updates the display name and description of an org-scoped custom role.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgRolesUpdate)]
public record UpdateOrgRoleCommand(
    Guid RoleId,
    string DisplayName,
    string? Description) : ICommand;

public sealed class UpdateOrgRoleCommandValidator : AbstractValidator<UpdateOrgRoleCommand>
{
    public UpdateOrgRoleCommandValidator()
    {
        RuleFor(x => x.RoleId).NotEmpty();
        RuleFor(x => x.DisplayName)
            .NotEmpty().WithMessage("Display name is required.")
            .MaximumLength(200);
        RuleFor(x => x.Description)
            .MaximumLength(1000)
            .When(x => x.Description is not null);
    }
}

public sealed class UpdateOrgRoleCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<UpdateOrgRoleCommand>
{
    public async Task<Result> Handle(
        UpdateOrgRoleCommand request,
        CancellationToken cancellationToken)
    {
        var isSuperAdmin = currentUser.HasPermission(AuthService.Domain.Permissions.PlatformRolesManage);
        var orgId = currentUser.OrganizationId;

        var role = await db.Roles
            .FirstOrDefaultAsync(r => r.Id == request.RoleId && r.DeletedAt == null, cancellationToken);

        if (role is null)
            return Result.Failure(Error.NotFound("Role", request.RoleId));

        // Only custom (org-scoped) roles may be updated; system roles are read-only
        if (role.IsSystemRole)
            return Result.Failure(Error.Forbidden("Role.SystemRoleReadOnly", "System roles cannot be modified."));

        // Org isolation check
        if (!isSuperAdmin && role.OrganizationId != orgId)
            return Result.Failure(Error.Forbidden("Role.AccessDenied", "You can only modify roles within your own organization."));

        role.Update(request.DisplayName, request.Description);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
