using AuthService.Application.Interfaces;
using AuthService.Application.Invitations.Commands.CreateInvitation;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;

namespace AuthService.Application.Invitations.Commands.ResendInvitation;

/// <summary>
/// Revokes the old invite token and issues a new one for the same invitation record.
/// Returns the new raw token (one-time).
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersInvite)]
public record ResendInvitationCommand(Guid InviteId) : ICommand<ResendInvitationResponse>;

/// <summary>Contains the new raw token — display once, never log.</summary>
public record ResendInvitationResponse(string RawToken, DateTime ExpiresAt);

public sealed class ResendInvitationCommandHandler(
    ICurrentUser currentUser,
    IInvitationRepository invitationRepo)
    : ICommandHandler<ResendInvitationCommand, ResendInvitationResponse>
{
    public async Task<Result<ResendInvitationResponse>> Handle(
        ResendInvitationCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Error.Forbidden("Invitation.NoOrg", "You must be a member of an organization.");

        var orgId = currentUser.OrganizationId.Value;

        var invite = await invitationRepo.GetByIdAsync(request.InviteId, cancellationToken);
        if (invite is null || invite.OrganizationId != orgId)
            return Error.NotFound("Invitation", request.InviteId);

        if (invite.Status == InvitationStatus.Accepted)
            return Error.Conflict("Invitation.AlreadyAccepted", "This invitation was already accepted.");

        if (invite.Status == InvitationStatus.Revoked)
            return Error.Conflict("Invitation.Revoked", "This invitation was revoked and cannot be resent.");

        // Generate a new token and extend expiry
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var tokenHash = CreateInvitationCommandHandler.HashToken(rawToken);
        var newExpiry = DateTime.UtcNow.AddHours(72);

        // Reset the invitation with the new token
        var resetInvitation = Invitation.Create(
            invite.OrganizationId,
            invite.Email,
            invite.PhoneNumber,
            invite.RoleId,
            currentUser.UserId,
            tokenHash,
            newExpiry);

        // Soft-delete old record, create new one
        invite.Revoke();
        invite.DeletedAt = DateTime.UtcNow;
        await invitationRepo.UpdateAsync(invite, cancellationToken);

        resetInvitation.AddDomainEvent(new InvitationCreatedEvent(
            resetInvitation.Id,
            orgId,
            invite.Email,
            invite.PhoneNumber,
            invite.RoleId,
            currentUser.UserId,
            newExpiry));

        await invitationRepo.AddAsync(resetInvitation, cancellationToken);

        return new ResendInvitationResponse(rawToken, newExpiry);
    }
}
