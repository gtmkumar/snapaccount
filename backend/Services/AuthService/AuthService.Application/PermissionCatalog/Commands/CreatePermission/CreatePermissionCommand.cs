using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Commands.CreatePermission;

/// <summary>
/// Creates a new entry in the global permission catalog (SUPER_ADMIN only).
///
/// The <paramref name="Name"/> must follow dot-notation: <c>resource.action</c>
/// (e.g. <c>gst.returns.file</c>, <c>org.roles.create</c>).
///   • resource  = first segment  (everything before the first dot)
///   • action    = remaining segments joined (everything after the first dot)
///
/// CAVEAT: adding a permission here registers it in the catalog so it can be
/// toggled in the permission matrix. It only ENFORCES access when application code
/// decorates a command/query with <c>[RequiresPermission("name")]</c>. The endpoint
/// itself does NOT make the permission functional in code.
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record CreatePermissionCommand(
    string Name,
    string? Description) : ICommand<CreatePermissionResponse>;

/// <summary>Response containing the newly created permission entry.</summary>
public record CreatePermissionResponse(
    Guid Id,
    string Name,
    string Resource,
    string Action,
    string? Description);

public sealed class CreatePermissionCommandValidator : AbstractValidator<CreatePermissionCommand>
{
    // Name must be lower-case dot-notation: resource.action (at least two segments,
    // each segment: one or more lowercase letters, digits, or underscores).
    private const string NamePattern = @"^[a-z0-9_]+(\.[a-z0-9_]+)+$";

    public CreatePermissionCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Permission name is required.")
            .MaximumLength(200)
            .Matches(NamePattern)
            .WithMessage(
                "Permission name must be lowercase dot-notation with at least two segments " +
                "(e.g. 'gst.returns.file'). Each segment: letters, digits, or underscores.");

        RuleFor(x => x.Description)
            .MaximumLength(500)
            .When(x => x.Description is not null);
    }
}

public sealed class CreatePermissionCommandHandler(IAuthDbContext db)
    : ICommandHandler<CreatePermissionCommand, CreatePermissionResponse>
{
    public async Task<Result<CreatePermissionResponse>> Handle(
        CreatePermissionCommand request,
        CancellationToken cancellationToken)
    {
        // I1.1-002: case-insensitive uniqueness — lower() on both sides so
        // 'Gst.Returns.File' and 'gst.returns.file' are treated as duplicates.
        // The validator already enforces lowercase, but this covers any future relaxation.
        var nameLower = request.Name.ToLowerInvariant();
        var exists = await db.Permissions
            .AnyAsync(p => p.Name.ToLower() == nameLower && p.DeletedAt == null, cancellationToken);

        if (exists)
            return Error.Conflict(
                "Permission.Duplicate",
                $"A permission named '{request.Name}' already exists in the catalog.");

        // Parse resource and action from dot-notation name
        var dotIndex = request.Name.IndexOf('.', StringComparison.Ordinal);
        var resource = request.Name[..dotIndex];
        var action   = request.Name[(dotIndex + 1)..];

        var permission = Permission.Create(request.Name, resource, action, request.Description);
        db.Permissions.Add(permission);
        await db.SaveChangesAsync(cancellationToken);

        return new CreatePermissionResponse(
            permission.Id,
            permission.Name,
            permission.Resource,
            permission.Action,
            permission.Description);
    }
}
