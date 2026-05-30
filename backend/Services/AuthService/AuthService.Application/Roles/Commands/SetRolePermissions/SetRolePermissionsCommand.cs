using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Roles.Commands.SetRolePermissions;

/// <summary>
/// Replaces the permission set of an org-scoped custom role.
///
/// DELEGATION RULE (scope §1.4 — CRITICAL): The caller may only grant permissions
/// that are a subset of their own effective permission set. Any permission requested
/// that the caller does not themselves hold results in a 403 Forbidden.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgPermissionsGrant)]
public record SetRolePermissionsCommand(
    Guid RoleId,
    IReadOnlyList<Guid> PermissionIds) : ICommand;

public sealed class SetRolePermissionsCommandValidator : AbstractValidator<SetRolePermissionsCommand>
{
    public SetRolePermissionsCommandValidator()
    {
        RuleFor(x => x.RoleId).NotEmpty();
        RuleFor(x => x.PermissionIds)
            .NotNull()
            .Must(ids => ids.Count <= 200)
            .WithMessage("Cannot assign more than 200 permissions to a single role.");
    }
}

public sealed class SetRolePermissionsCommandHandler : ICommandHandler<SetRolePermissionsCommand>
{
    private readonly IAuthDbContext _db;
    private readonly ICurrentUser _currentUser;

    public SetRolePermissionsCommandHandler(IAuthDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    /// <inheritdoc />
    public async Task<Result> Handle(
        SetRolePermissionsCommand request,
        CancellationToken cancellationToken)
    {
        var isSuperAdmin = _currentUser.HasPermission(AuthService.Domain.Permissions.PlatformPermissionsManage)
                        || _currentUser.HasPermission("*");

        // TASK A: validate org context before any DB write (non-SUPER_ADMIN only)
        if (!isSuperAdmin)
        {
            var (_, orgFailure) = await OrgContextGuard.ValidateAsync(
                _db, _currentUser, requireMembership: true, cancellationToken);
            if (orgFailure is not null)
                return Result.Failure(orgFailure);
        }

        var orgId = _currentUser.OrganizationId;

        // Resolve the target role
        var role = await _db.Roles
            .Include(r => r.Permissions)
            .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(r => r.Id == request.RoleId && r.DeletedAt == null, cancellationToken);

        if (role is null)
            return Result.Failure(Error.NotFound("Role", request.RoleId));

        if (role.IsSystemRole)
            return Result.Failure(Error.Forbidden("Role.SystemRoleReadOnly", "System role permissions cannot be modified."));

        // Org isolation
        if (!isSuperAdmin && role.OrganizationId != orgId)
            return Result.Failure(Error.Forbidden("Role.AccessDenied", "You can only modify roles within your own organization."));

        // Load the requested permissions from the DB (validates they exist)
        var distinctIds = request.PermissionIds.Distinct().ToList();
        var requestedPerms = await _db.Permissions
            .Where(p => distinctIds.Contains(p.Id) && p.DeletedAt == null)
            .ToListAsync(cancellationToken);

        if (requestedPerms.Count != distinctIds.Count)
        {
            var missingIds = distinctIds.Except(requestedPerms.Select(p => p.Id));
            return Result.Failure(Error.Validation(
                "Role.InvalidPermissions",
                $"The following permission IDs do not exist: {string.Join(", ", missingIds)}"));
        }

        // ── DELEGATION RULE ENFORCEMENT ──────────────────────────────────────────────
        // Non-SUPER_ADMIN callers may only grant permissions they themselves hold.
        // I1.3: resolver now includes direct user_permission grants via shared helper.
        if (!isSuperAdmin && !_currentUser.HasPermission("*"))
        {
            var callerEffectivePerms = await EffectivePermissionResolver.ResolveAsync(
                _db, _currentUser.UserId, orgId, cancellationToken);
            // also include JWT claim permissions
            callerEffectivePerms.UnionWith(_currentUser.Permissions.Where(p => p != "*"));

            var requestedPermNames = requestedPerms
                .Select(p => p.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var notGrantable = requestedPermNames
                .Except(callerEffectivePerms, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (notGrantable.Count > 0)
            {
                return Result.Failure(Error.Forbidden(
                    "Role.PrivilegeEscalation",
                    $"You cannot grant permissions you do not hold: {string.Join(", ", notGrantable.Take(10))}"));
            }
        }
        // ────────────────────────────────────────────────────────────────────────────

        // Compute delta: soft-delete removed, add new
        var existingPermIds = role.Permissions
            .Where(rp => rp.DeletedAt == null)
            .Select(rp => rp.PermissionId)
            .ToHashSet();

        var requestedPermIds = requestedPerms.Select(p => p.Id).ToHashSet();

        // Soft-delete removed permissions
        foreach (var rp in role.Permissions.Where(rp => rp.DeletedAt == null && !requestedPermIds.Contains(rp.PermissionId)))
            rp.DeletedAt = DateTime.UtcNow;

        // Add new permissions
        var toAdd = requestedPermIds
            .Where(id => !existingPermIds.Contains(id))
            .Select(id => RolePermission.Create(role.Id, id));
        _db.RolePermissions.AddRange(toAdd);

        await _db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

}
