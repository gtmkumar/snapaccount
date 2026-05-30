using AuthService.Application.Invitations.Commands.CreateInvitation;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using AuthService.Application.Common.Interfaces;

namespace AuthService.Application.Invitations.Queries.ValidateInviteToken;

/// <summary>
/// Validates an invite token and returns the invitation details for the acceptance page.
/// This is a public endpoint — no authentication required.
/// </summary>
public record ValidateInviteTokenQuery(string RawToken) : IQuery<InviteTokenValidationDto>;

/// <summary>Details shown to the user on the invitation acceptance page.</summary>
public record InviteTokenValidationDto(
    Guid InviteId,
    string OrganizationName,
    string Email,
    string RoleName,
    string RoleDisplayName,
    DateTime ExpiresAt,
    bool IsValid);

public sealed class ValidateInviteTokenQueryHandler(IAuthDbContext db, IInvitationRepository invitationRepo)
    : IQueryHandler<ValidateInviteTokenQuery, InviteTokenValidationDto>
{
    public async Task<Result<InviteTokenValidationDto>> Handle(
        ValidateInviteTokenQuery request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RawToken))
            return Error.Validation("Invitation.InvalidToken", "Invite token is required.");

        var tokenHash = CreateInvitationCommandHandler.HashToken(request.RawToken);

        var invitation = await invitationRepo.GetByTokenHashAsync(tokenHash, cancellationToken);
        if (invitation is null)
            return Error.NotFound("Invitation", "token");

        var org = await db.Organizations
            .FirstOrDefaultAsync(o => o.Id == invitation.OrganizationId && o.DeletedAt == null, cancellationToken);

        var role = await db.Roles
            .FirstOrDefaultAsync(r => r.Id == invitation.RoleId && r.DeletedAt == null, cancellationToken);

        var dto = new InviteTokenValidationDto(
            invitation.Id,
            org?.BusinessName ?? "Unknown Organization",
            invitation.Email,
            role?.Name ?? "Unknown",
            role?.DisplayName ?? "Unknown",
            invitation.ExpiresAt,
            invitation.IsValid(DateTime.UtcNow));

        return Result<InviteTokenValidationDto>.Success(dto);
    }
}
