using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ItrService.Infrastructure.Messaging;

/// <summary>
/// Polls for ITR refund status updates.
/// MVP: mock implementation that simulates ITDREIN refund status progression.
/// Production: integrate with NSDL/CPC refund status API.
/// </summary>
public sealed class ItrRefundPollingHandler(
    IItrDbContext dbContext,
    ILogger<ItrRefundPollingHandler> logger) : IItrRefundPollingHandler
{
    private static readonly string[] ProgressionStatuses =
        ["PROCESSING", "DETERMINED", "ISSUED"];

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken ct)
    {
        // Find all filings where refund may be due (filed/e-verified, positive refund)
        var candidateFilings = await dbContext.Filings
            .Where(f => (f.Status == "FILED" || f.Status == "E_VERIFIED")
                        && f.DeletedAt == null)
            .ToListAsync(ct);

        if (candidateFilings.Count == 0)
        {
            logger.LogDebug("ItrRefundPollingHandler: no candidate filings for polling.");
            return;
        }

        int updated = 0;
        foreach (var filing in candidateFilings)
        {
            if (filing.AcknowledgementNumber is null) continue;

            // Look up or create refund status entry
            var entry = await dbContext.RefundStatusEntries
                .FirstOrDefaultAsync(r => r.FilingId == filing.Id && r.DeletedAt == null, ct);

            if (entry is null)
            {
                // Create initial entry
                entry = RefundStatusEntry.Create(filing.Id, filing.AssesseeId);
                dbContext.RefundStatusEntries.Add(entry);
            }

            // MVP: mock progression — advance status by one step every poll cycle
            var mockStatus = SimulatePoll(entry.RefundStatus, filing.AcknowledgementNumber);
            entry.UpdateStatus(
                mockStatus.Status,
                mockStatus.RefundAmount,
                mockStatus.PaymentDate,
                statusMessage: mockStatus.Remarks);

            updated++;
        }

        if (updated > 0)
            await dbContext.SaveChangesAsync(ct);

        logger.LogInformation("ItrRefundPollingHandler: polled {Count} refund entries.", updated);
    }

    /// <summary>Mock poll — simulates refund status progression for MVP.</summary>
    private static MockPollResult SimulatePoll(string? currentStatus, string ackNo)
    {
        // Deterministic progression for demo: advance one step per day using ack hash
        var hash = Math.Abs(ackNo.GetHashCode()) % 10;

        return (currentStatus, hash) switch
        {
            (null or "PENDING" or "NOT_DETERMINED", >= 5) =>
                new("DETERMINED", "Refund determined", null, null, null),
            ("DETERMINED", >= 3) =>
                new("ISSUED", "Refund sent to bank", 1500m, "NEFT", DateOnly.FromDateTime(DateTime.UtcNow)),
            ("ISSUED", _) =>
                new("ISSUED", "Refund credited", 1500m, "NEFT", DateOnly.FromDateTime(DateTime.UtcNow)),
            _ =>
                new("PROCESSING", "Under processing", null, null, null)
        };
    }

    private sealed record MockPollResult(
        string Status,
        string? Remarks,
        decimal? RefundAmount,
        string? RefundMode,
        DateOnly? PaymentDate);

}
