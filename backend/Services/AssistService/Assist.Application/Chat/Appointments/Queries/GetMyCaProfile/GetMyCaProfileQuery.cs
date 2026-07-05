using ChatService.Application.Appointments.Queries.ListCaProfiles;
using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Queries.GetMyCaProfile;

/// <summary>
/// Returns the CA profile owned by the calling user, scoped strictly to their identity.
///
/// ACM-10: the availability-management pages previously loaded "my profile" from the
/// platform-wide booking directory (GET /appointments/ca-profiles), which both leaked
/// other CAs' profiles to non-CA roles (ACM-04 IDOR) and 403'd the CA who owns a profile
/// because the directory is gated by chat.appointments.book (a booking permission the CA
/// role does not hold). This query is the correct self-scoped read for a CA managing
/// their own availability — gated by chat.slots.manage and filtered to currentUser.UserId,
/// so no caller can ever read another CA's profile through it.
///
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record GetMyCaProfileQuery : IQuery<CaProfileSummaryDto>;

/// <summary>Handles GetMyCaProfileQuery — resolves the caller's own CA profile.</summary>
public sealed class GetMyCaProfileQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetMyCaProfileQuery, CaProfileSummaryDto>
{
    /// <inheritdoc />
    public async Task<Result<CaProfileSummaryDto>> Handle(
        GetMyCaProfileQuery request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<CaProfileSummaryDto>.Failure(
                Error.Unauthorized("CaProfile.Unauthenticated", "User is not authenticated."));

        var profile = await db.CaProfiles
            .Where(p => p.UserId == currentUser.UserId)
            .Select(p => new CaProfileSummaryDto(
                p.Id,
                p.UserId,
                p.DisplayName,
                p.Bio,
                p.Specialisations,
                p.AverageRating,
                p.RatingCount,
                p.IsActive,
                p.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (profile is null)
            return Result<CaProfileSummaryDto>.Failure(
                Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

        return Result<CaProfileSummaryDto>.Success(profile);
    }
}
