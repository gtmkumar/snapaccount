using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Roles.Commands.CreateOrgRole;

/// <summary>Creates a new org-scoped custom role.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgRolesCreate)]
public record CreateOrgRoleCommand(
    string Name,
    string DisplayName,
    string? Description) : ICommand<CreateOrgRoleResponse>;

/// <summary>Response containing the ID of the newly created role.</summary>
public record CreateOrgRoleResponse(Guid RoleId);

public sealed class CreateOrgRoleCommandValidator : AbstractValidator<CreateOrgRoleCommand>
{
    public CreateOrgRoleCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Role name is required.")
            .MaximumLength(100)
            .Matches(@"^[A-Za-z0-9_\-]+$")
            .WithMessage("Role name may only contain letters, digits, underscores, and hyphens.");

        RuleFor(x => x.DisplayName)
            .NotEmpty().WithMessage("Display name is required.")
            .MaximumLength(200);

        RuleFor(x => x.Description)
            .MaximumLength(1000)
            .When(x => x.Description is not null);
    }
}

public sealed class CreateOrgRoleCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<CreateOrgRoleCommand, CreateOrgRoleResponse>
{
    public async Task<Result<CreateOrgRoleResponse>> Handle(
        CreateOrgRoleCommand request,
        CancellationToken cancellationToken)
    {
        // TASK A: validate org context before any FK-touching write
        var (orgId, orgFailure) = await OrgContextGuard.ValidateAsync(
            db, currentUser, requireMembership: true, cancellationToken);
        if (orgFailure is not null)
            return orgFailure;

        // Check for name collision within this org
        var exists = await db.Roles
            .AnyAsync(r =>
                r.OrganizationId == orgId &&
                r.Name == request.Name &&
                r.DeletedAt == null,
                cancellationToken);

        if (exists)
            return Error.Conflict("Role.NameConflict", $"A role named '{request.Name}' already exists in this organization.");

        var role = Role.CreateOrgRole(
            organizationId: orgId,
            createdByUserId: currentUser.UserId,
            name: request.Name,
            displayName: request.DisplayName,
            description: request.Description);

        db.Roles.Add(role);
        await db.SaveChangesAsync(cancellationToken);

        return new CreateOrgRoleResponse(role.Id);
    }
}
