using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Members.Commands.UpdateOrgMember;

/// <summary>
/// Updates a member's role within the organization.
///
/// DELEGATION RULE: The new role's permission set must not exceed the caller's
/// effective permission set (prevent privilege escalation via role reassignment).
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersUpdate)]
public record UpdateOrgMemberCommand(
    Guid MemberId,
    string? Role) : ICommand;

public sealed class UpdateOrgMemberCommandValidator : AbstractValidator<UpdateOrgMemberCommand>
{
    public UpdateOrgMemberCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
    }
}

public sealed class UpdateOrgMemberCommandHandler : ICommandHandler<UpdateOrgMemberCommand>
{
    private readonly IAuthDbContext _db;
    private readonly ICurrentUser _currentUser;

    public UpdateOrgMemberCommandHandler(IAuthDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<Result> Handle(UpdateOrgMemberCommand request, CancellationToken cancellationToken)
    {
        // TASK A: validate org context before any FK-touching write
        var (orgId, orgFailure) = await OrgContextGuard.ValidateAsync(
            _db, _currentUser, requireMembership: true, cancellationToken);
        if (orgFailure is not null)
            return Result.Failure(orgFailure);

        var isSuperAdmin = _currentUser.HasPermission(AuthService.Domain.Permissions.PlatformRolesManage);

        var member = await _db.OrganizationMembers
            .FirstOrDefaultAsync(m =>
                m.Id == request.MemberId &&
                m.OrganizationId == orgId &&
                m.DeletedAt == null,
                cancellationToken);

        if (member is null)
            return Result.Failure(Error.NotFound("Member", request.MemberId));

        if (request.Role is not null)
        {
            var newRole = await _db.Roles
                .Include(r => r.Permissions)
                .ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(r =>
                    r.Name == request.Role &&
                    r.DeletedAt == null &&
                    (r.OrganizationId == null || r.OrganizationId == orgId),
                    cancellationToken);

            if (newRole is null)
                return Result.Failure(Error.NotFound("Role", request.Role));

            // DELEGATION RULE: caller cannot assign a role whose perms exceed their own
            if (!isSuperAdmin && !_currentUser.HasPermission("*"))
            {
                var callerEffectivePerms = await ResolveCallerEffectivePermissionNamesAsync(
                    _currentUser.UserId, orgId, cancellationToken);

                var rolePermNames = newRole.Permissions
                    .Where(rp => rp.DeletedAt == null && rp.Permission is not null)
                    .Select(rp => rp.Permission!.Name)
                    .ToList();

                var notGrantable = rolePermNames
                    .Except(callerEffectivePerms, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (notGrantable.Count > 0)
                    return Result.Failure(Error.Forbidden(
                        "Member.PrivilegeEscalation",
                        $"You cannot assign a role containing permissions you do not hold: {string.Join(", ", notGrantable.Take(5))}"));
            }

            member.AssignRole(newRole.Id);
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    private async Task<HashSet<string>> ResolveCallerEffectivePermissionNamesAsync(
        Guid userId, Guid orgId, CancellationToken ct)
    {
        var platformPerms = await _db.UserRoles
            .Where(ur => ur.UserId == userId && ur.IsActive && ur.DeletedAt == null)
            .Join(_db.RolePermissions.Where(rp => rp.DeletedAt == null),
                ur => ur.RoleId, rp => rp.RoleId, (ur, rp) => rp.PermissionId)
            .Join(_db.Permissions.Where(p => p.DeletedAt == null),
                permId => permId, p => p.Id, (_, p) => p.Name)
            .ToListAsync(ct);

        var orgPerms = await _db.OrganizationMembers
            .Where(m => m.UserId == userId && m.OrganizationId == orgId && m.IsActive && m.DeletedAt == null)
            .Join(_db.RolePermissions.Where(rp => rp.DeletedAt == null),
                m => m.RoleId, rp => rp.RoleId, (m, rp) => rp.PermissionId)
            .Join(_db.Permissions.Where(p => p.DeletedAt == null),
                permId => permId, p => p.Id, (_, p) => p.Name)
            .ToListAsync(ct);

        var jwtPerms = _currentUser.Permissions.Where(p => p != "*");
        return [.. platformPerms, .. orgPerms, .. jwtPerms];
    }
}
