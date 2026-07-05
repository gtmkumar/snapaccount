using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Application.Invitations.Commands.CreateInvitation;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Invitations.Commands.AcceptInvitation;

/// <summary>
/// Accepts an org invitation. The caller must be authenticated.
/// The caller's user account is linked to the invitation's org with the assigned role.
///
/// M1-R-002: The authenticated caller's email (or phone) MUST match the invitee
/// recorded on the invitation. Any other authenticated user holding the token is
/// rejected with 403 Forbidden — this prevents token-forwarding attacks where a
/// different account accepts an invitation meant for someone else.
/// </summary>
public record AcceptInvitationCommand(string RawToken) : ICommand<AcceptInvitationResponse>;

/// <summary>Result returned after successful acceptance.</summary>
public record AcceptInvitationResponse(
    Guid OrganizationId,
    string OrganizationName,
    Guid RoleId,
    string RoleName);

public sealed class AcceptInvitationCommandValidator : AbstractValidator<AcceptInvitationCommand>
{
    public AcceptInvitationCommandValidator()
    {
        RuleFor(x => x.RawToken).NotEmpty().WithMessage("Invite token is required.");
    }
}

public sealed class AcceptInvitationCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IUserRepository userRepo,
    IInvitationRepository invitationRepo)
    : ICommandHandler<AcceptInvitationCommand, AcceptInvitationResponse>
{
    public async Task<Result<AcceptInvitationResponse>> Handle(
        AcceptInvitationCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            return Error.Unauthorized("Invitation.NotAuthenticated", "You must be signed in to accept an invitation.");

        var tokenHash = CreateInvitationCommandHandler.HashToken(request.RawToken);

        var invitation = await invitationRepo.GetByTokenHashAsync(tokenHash, cancellationToken);
        if (invitation is null)
            return Error.NotFound("Invitation", "token");

        if (!invitation.IsValid(DateTime.UtcNow))
        {
            if (invitation.Status == InvitationStatus.Accepted)
                return Error.Conflict("Invitation.AlreadyAccepted", "This invitation has already been accepted.");

            if (invitation.Status == InvitationStatus.Revoked)
                return Error.Conflict("Invitation.Revoked", "This invitation has been revoked.");

            if (invitation.ExpiresAt <= DateTime.UtcNow)
            {
                invitation.MarkExpired();
                await invitationRepo.UpdateAsync(invitation, cancellationToken);
                return Error.Conflict("Invitation.Expired", "This invitation has expired. Please request a new one.");
            }
        }

        // ── M1-R-002: Caller identity must match the invitee ────────────────────────
        // Load the caller's user record to get their verified email/phone.
        var callerUser = await userRepo.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (callerUser is null)
            return Error.NotFound("User", currentUser.UserId);

        var emailMatches = !string.IsNullOrWhiteSpace(callerUser.Email) &&
            string.Equals(callerUser.Email.Trim(), invitation.Email.Trim(),
                StringComparison.OrdinalIgnoreCase);

        var phoneMatches = invitation.PhoneNumber is not null &&
            !string.IsNullOrWhiteSpace(callerUser.PhoneNumber) &&
            string.Equals(callerUser.PhoneNumber.Trim(), invitation.PhoneNumber.Trim(),
                StringComparison.Ordinal);

        if (!emailMatches && !phoneMatches)
        {
            return Error.Forbidden(
                "Invitation.IdentityMismatch",
                "This invitation was issued to a different email address or phone number. " +
                "Sign in with the account that matches the invitation.");
        }
        // ─────────────────────────────────────────────────────────────────────────────

        // Check the user isn't already a member of this org
        var alreadyMember = await db.OrganizationMembers
            .AnyAsync(m =>
                m.OrganizationId == invitation.OrganizationId &&
                m.UserId == currentUser.UserId &&
                m.DeletedAt == null,
                cancellationToken);

        if (alreadyMember)
            return Error.Conflict("Invitation.AlreadyMember", "You are already a member of this organization.");

        // Create org membership
        var member = OrganizationMember.Create(
            invitation.OrganizationId,
            currentUser.UserId,
            invitation.RoleId);

        db.OrganizationMembers.Add(member);

        // Mark invitation accepted
        invitation.Accept(currentUser.UserId);
        await invitationRepo.UpdateAsync(invitation, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var org = await db.Organizations
            .FirstOrDefaultAsync(o => o.Id == invitation.OrganizationId, cancellationToken);

        var role = await db.Roles
            .FirstOrDefaultAsync(r => r.Id == invitation.RoleId, cancellationToken);

        return new AcceptInvitationResponse(
            invitation.OrganizationId,
            org?.BusinessName ?? string.Empty,
            invitation.RoleId,
            role?.Name ?? string.Empty);
    }
}
