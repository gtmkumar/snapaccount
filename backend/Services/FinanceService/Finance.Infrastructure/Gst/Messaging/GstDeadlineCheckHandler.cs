using GstService.Domain.Events;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace GstService.Infrastructure.Messaging;

/// <summary>
/// Scoped service that runs the GST deadline sweep.
/// For each org × open return: emits GstDeadlineApproachingEvent at D-7, D-3, D-1 and D+1 (HIGH).
/// Phase 6B delivery.
/// </summary>
public sealed class GstDeadlineCheckHandler(
    GstDbContext dbContext,
    IPubSubPublisher publisher,
    ILogger<GstDeadlineCheckHandler> logger) : IGstDeadlineCheckHandler
{
    private static readonly int[] NotifyDays = [-1, 1, 3, 7]; // D+1 (overdue), D-1, D-3, D-7

    /// <inheritdoc />
    public async Task RunAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var openReturns = await dbContext.GstReturns
            .Where(r => r.FilingDeadline.HasValue
                && r.Status != "FILED"
                && r.DeletedAt == null)
            .ToListAsync(ct);

        logger.LogInformation("GstDeadlineCheck: found {Count} open returns to evaluate", openReturns.Count);

        foreach (var ret in openReturns)
        {
            var daysUntilDue = ret.FilingDeadline!.Value.DayNumber - today.DayNumber;

            if (NotifyDays.Contains(daysUntilDue))
            {
                var evt = new GstDeadlineApproachingEvent(
                    ret.Id,
                    ret.OrganizationId,
                    ret.ReturnType,
                    ret.FilingDeadline.Value,
                    daysUntilDue);

                await publisher.PublishAsync("snapaccount.gst.deadline-approaching", evt, ct);

                logger.LogInformation(
                    "GstDeadlineCheck: published GstDeadlineApproachingEvent returnId={ReturnId} " +
                    "org={OrgId} daysUntilDue={Days} priority={Priority}",
                    ret.Id, ret.OrganizationId, daysUntilDue, evt.Priority);
            }
        }
    }
}
