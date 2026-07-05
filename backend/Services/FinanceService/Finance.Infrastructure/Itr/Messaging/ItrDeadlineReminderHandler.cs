using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace ItrService.Infrastructure.Messaging;

/// <summary>
/// Seasonal ITR deadline reminder handler.
/// May–Sep (filing season): full cascade at D-7, D-3, D-1, overdue.
/// Oct–Apr: weekly Sunday-only digest at D-7 only.
/// </summary>
public sealed class ItrDeadlineReminderHandler(
    IItrDbContext dbContext,
    IPubSubPublisher pubSubPublisher,
    ILogger<ItrDeadlineReminderHandler> logger) : IItrDeadlineReminderHandler
{
    // Positive = days remaining before deadline (D-7 means 7 days left)
    // Negative = days overdue (D+1 means 1 day past deadline)
    private static readonly int[] FilingSeasonRemainingDays = [7, 3, 1, -1];
    private static readonly int[] OffSeasonRemainingDays = [7];

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var month = today.Month;

        // Seasonal gating: full cascade only during filing season (May–Sep)
        bool isFilingSeason = month is >= 5 and <= 9;

        // Outside filing season: only run on Sundays (weekly digest)
        if (!isFilingSeason && DateTime.UtcNow.DayOfWeek != DayOfWeek.Sunday)
        {
            logger.LogDebug("ItrDeadlineReminderHandler: outside filing season and not Sunday — skipping.");
            return;
        }

        var daysToCheck = isFilingSeason ? FilingSeasonRemainingDays : OffSeasonRemainingDays;

        // Find open filings that are not yet filed/e-verified
        var openFilings = await dbContext.Filings
            .Where(f => f.Status != "FILED" && f.Status != "E_VERIFIED"
                        && f.Status != "REFUND_ISSUED" && f.DeletedAt == null)
            .ToListAsync(ct);

        int dispatched = 0;
        foreach (var filing in openFilings)
        {
            var deadline = GetDeadline(filing.AssessmentYear);
            if (deadline is null) continue;

            // Positive = days remaining; negative = overdue
            var daysUntilDue = deadline.Value.DayNumber - today.DayNumber;

            if (!daysToCheck.Contains(daysUntilDue)) continue;

            var isWeeklyDigest = !isFilingSeason;

            var evt = new ItrDeadlineReminderEvent(
                filing.AssesseeId,
                filing.AssessmentYear,
                daysUntilDue,
                isWeeklyDigest);

            try
            {
                await pubSubPublisher.PublishAsync("itr-deadline-reminders", evt, ct);
                dispatched++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ItrDeadlineReminderHandler: failed to publish for assessee {AssesseeId}", filing.AssesseeId);
            }
        }

        logger.LogInformation(
            "ItrDeadlineReminderHandler: dispatched {Count} reminder events (season={Season}, today={Today})",
            dispatched, isFilingSeason ? "FILING" : "OFF", today);
    }

    /// <summary>Returns the ITR filing deadline for a given assessment year. Configuration-driven for production.</summary>
    private static DateOnly? GetDeadline(string assessmentYear) => assessmentYear switch
    {
        "AY2024-25" => new DateOnly(2024, 7, 31),
        "AY2025-26" => new DateOnly(2025, 7, 31),
        "AY2026-27" => new DateOnly(2026, 7, 31),
        _ => null
    };
}
