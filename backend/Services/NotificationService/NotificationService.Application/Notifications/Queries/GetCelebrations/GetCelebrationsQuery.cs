using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Queries.GetCelebrations;

/// <summary>
/// Returns a map of celebration kind → boolean (fired or not) for the authenticated user.
/// Phase 6F: used by mobile/frontend to decide whether to show celebration animations.
/// Reuses notification.notification_log with EventCode = 'celebration.{kind}'.
/// </summary>
public record GetCelebrationsQuery : IQuery<CelebrationsDto>;

/// <summary>Map of all known celebration kinds to their fired status.</summary>
public record CelebrationsDto(IReadOnlyDictionary<string, bool> Celebrations);

/// <summary>Handler: returns which celebrations have already been fired for the user.</summary>
public sealed class GetCelebrationsQueryHandler(
    INotificationDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetCelebrationsQuery, CelebrationsDto>
{
    private static readonly string[] AllKinds =
    [
        "first_gst_filed",
        "first_refund_credited",
        "first_loan_disbursed",
        "first_itr_filed",
        "first_document_uploaded"
    ];

    /// <inheritdoc />
    public async Task<Result<CelebrationsDto>> Handle(
        GetCelebrationsQuery request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Fetch all celebration log entries for this user in one query
        var firedCodes = await db.NotificationLog
            .Where(l => l.UserId == userId
                        && l.EventCode.StartsWith("celebration.")
                        && l.DeletedAt == null)
            .Select(l => l.EventCode)
            .Distinct()
            .ToListAsync(cancellationToken);

        var result = AllKinds.ToDictionary(
            kind => kind,
            kind => firedCodes.Contains($"celebration.{kind}", StringComparer.OrdinalIgnoreCase));

        return new CelebrationsDto(result);
    }
}
