using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;

namespace AuthService.Application.Invitations.Commands.CreateInvitation;

/// <summary>Creates a new org invitation and returns the raw invite token (one-time, show once).</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersInvite)]
public record CreateInvitationCommand(
    string Email,
    string? PhoneNumber,
    string RoleName,
    string? CustomMessage = null) : ICommand<CreateInvitationResponse>;

/// <summary>Contains the raw token that must be sent to the invitee (show-once, never log).</summary>
public record CreateInvitationResponse(
    Guid InviteId,
    string RawToken,
    DateTime ExpiresAt);

public sealed class CreateInvitationCommandValidator : AbstractValidator<CreateInvitationCommand>
{
    public CreateInvitationCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("A valid email address is required.")
            .MaximumLength(320);

        RuleFor(x => x.RoleName)
            .NotEmpty().WithMessage("Role is required.")
            .MaximumLength(100);

        When(x => x.PhoneNumber is not null, () =>
        {
            RuleFor(x => x.PhoneNumber!)
                .Matches(@"^\+[1-9]\d{6,14}$")
                .WithMessage("Phone number must be in E.164 format (e.g. +919876543210).");
        });
    }
}

public sealed class CreateInvitationCommandHandler : ICommandHandler<CreateInvitationCommand, CreateInvitationResponse>
{
    private readonly IAuthDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IInvitationRepository _invitationRepo;

    public CreateInvitationCommandHandler(
        IAuthDbContext db,
        ICurrentUser currentUser,
        IInvitationRepository invitationRepo)
    {
        _db = db;
        _currentUser = currentUser;
        _invitationRepo = invitationRepo;
    }

    public async Task<Result<CreateInvitationResponse>> Handle(
        CreateInvitationCommand request,
        CancellationToken cancellationToken)
    {
        // TASK A: validate org context before any FK-touching write
        var (orgId, orgFailure) = await OrgContextGuard.ValidateAsync(
            _db, _currentUser, requireMembership: true, cancellationToken);
        if (orgFailure is not null)
            return orgFailure;

        // Resolve the target role within this org (or system roles)
        var role = await _db.Roles
            .Include(r => r.Permissions).ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(r =>
                r.Name == request.RoleName &&
                r.DeletedAt == null &&
                (r.OrganizationId == null || r.OrganizationId == orgId),
                cancellationToken);

        if (role is null)
            return Error.NotFound("Role", request.RoleName);

        // DELEGATION RULE: inviter cannot assign a role whose perms exceed their own
        var isSuperAdmin = _currentUser.HasPermission(AuthService.Domain.Permissions.PlatformPermissionsManage)
                        || _currentUser.HasPermission("*");

        if (!isSuperAdmin)
        {
            var callerEffectivePerms = await ResolveCallerEffectivePermissionNamesAsync(
                _currentUser.UserId, orgId, cancellationToken);

            var rolePermNames = role.Permissions
                .Where(rp => rp.DeletedAt == null && rp.Permission is not null)
                .Select(rp => rp.Permission!.Name)
                .ToList();

            var notGrantable = rolePermNames
                .Except(callerEffectivePerms, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (notGrantable.Count > 0)
                return Error.Forbidden(
                    "Invitation.PrivilegeEscalation",
                    $"You cannot invite someone to a role containing permissions you do not hold: {string.Join(", ", notGrantable.Take(5))}");
        }

        // Prevent duplicate pending invites to the same email in this org
        var hasPending = await _invitationRepo.HasPendingInviteAsync(orgId, request.Email, cancellationToken);
        if (hasPending)
            return Error.Conflict("Invitation.Duplicate",
                $"A pending invitation has already been sent to {request.Email}. Revoke it before resending.");

        // Generate a cryptographically secure 256-bit token
        var rawToken = GenerateSecureToken();
        var tokenHash = HashToken(rawToken);

        var invitation = Invitation.Create(
            organizationId: orgId,
            email: request.Email,
            phoneNumber: request.PhoneNumber,
            roleId: role.Id,
            invitedByUserId: _currentUser.UserId,
            tokenHash: tokenHash,
            expiresAt: DateTime.UtcNow.AddHours(72));

        invitation.AddDomainEvent(new InvitationCreatedEvent(
            invitation.Id,
            orgId,
            request.Email,
            request.PhoneNumber,
            role.Id,
            _currentUser.UserId,
            invitation.ExpiresAt));

        await _invitationRepo.AddAsync(invitation, cancellationToken);

        return new CreateInvitationResponse(invitation.Id, rawToken, invitation.ExpiresAt);
    }

    /// <summary>Generates a URL-safe base64 random token (32 bytes = 256 bits).</summary>
    private static string GenerateSecureToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    /// <summary>SHA-256 hash of the raw token (stored in DB, never the raw token itself).</summary>
    public static string HashToken(string rawToken)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(rawToken);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
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
