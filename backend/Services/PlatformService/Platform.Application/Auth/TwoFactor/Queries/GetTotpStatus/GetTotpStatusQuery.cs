using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.TwoFactor.Queries.GetTotpStatus;

/// <summary>2FA status for the authenticated user.</summary>
/// <param name="Enabled">True when 2FA is confirmed and active.</param>
/// <param name="ConfirmedAt">UTC timestamp when 2FA was confirmed, null if not yet confirmed.</param>
public record TotpStatusResponse(bool Enabled, DateTime? ConfirmedAt);

/// <summary>
/// GET /auth/me/2fa/status (RequireAuthorization)
/// Returns whether 2FA is enabled for the current user.
/// </summary>
public record GetTotpStatusQuery : IQuery<TotpStatusResponse>;

public sealed class GetTotpStatusQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetTotpStatusQuery, TotpStatusResponse>
{
    public async Task<Result<TotpStatusResponse>> Handle(
        GetTotpStatusQuery request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var totp = await db.UserTotps
            .FirstOrDefaultAsync(t => t.UserId == userId && t.DeletedAt == null, cancellationToken);

        if (totp is null)
            return new TotpStatusResponse(false, null);

        return new TotpStatusResponse(totp.IsEnabled, totp.ConfirmedAt);
    }
}
