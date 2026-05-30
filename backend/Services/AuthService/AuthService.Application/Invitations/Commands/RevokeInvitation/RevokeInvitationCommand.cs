using AuthService.Application.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using AuthService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Invitations.Commands.RevokeInvitation;

/// <summary>Revokes a pending invitation so the token can no longer be used.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersInvite)]
public record RevokeInvitationCommand(Guid InviteId) : ICommand;

public sealed class RevokeInvitationCommandHandler(
    ICurrentUser currentUser,
    IInvitationRepository invitationRepo)
    : ICommandHandler<RevokeInvitationCommand>
{
    public async Task<Result> Handle(RevokeInvitationCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result.Failure(Error.Forbidden("Invitation.NoOrg", "You must be a member of an organization."));

        var orgId = currentUser.OrganizationId.Value;

        var invite = await invitationRepo.GetByIdAsync(request.InviteId, cancellationToken);
        if (invite is null || invite.OrganizationId != orgId)
            return Result.Failure(Error.NotFound("Invitation", request.InviteId));

        if (invite.Status != InvitationStatus.Pending)
            return Result.Failure(Error.Conflict("Invitation.NotPending", "Only pending invitations can be revoked."));

        invite.Revoke();
        invite.DeletedAt = DateTime.UtcNow;
        await invitationRepo.UpdateAsync(invite, cancellationToken);
        return Result.Success();
    }
}
