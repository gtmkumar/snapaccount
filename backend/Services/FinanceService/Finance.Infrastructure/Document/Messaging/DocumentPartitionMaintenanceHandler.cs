using DocumentService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace DocumentService.Infrastructure.Messaging;

/// <summary>
/// GAP-113: maintains monthly partitions for <c>document.document</c> (Finance-owned).
/// Invoked monthly by <see cref="PartitionMaintenanceSubscriber"/>. Idempotent — safe to
/// run repeatedly; <c>create_monthly_partitions</c> skips months that already have a partition.
/// </summary>
public sealed class DocumentPartitionMaintenanceHandler(
    DocumentDbContext db,
    IConfiguration configuration,
    ILogger<DocumentPartitionMaintenanceHandler> logger) : IPartitionMaintenanceHandler
{
    /// <inheritdoc />
    public async Task RunAsync(CancellationToken ct)
    {
        var monthsAhead = configuration.GetValue<int?>("PartitionMaintenance:MonthsAhead") ?? 6;

        await db.Database.ExecuteSqlRawAsync(
            "SELECT public.create_monthly_partitions({0}, {1}, {2})",
            new object[] { "document", "document", monthsAhead }, ct);

        logger.LogInformation(
            "Partition maintenance complete for document.document (+{Months} months ahead)", monthsAhead);

        // GAP-113: retention drop is OFF by default — DESTRUCTIVE. document.document is FK-referenced
        // (ocr_result, document_page, …) and already has the DocumentArchive/GCS-lifecycle purge path,
        // so only enable after reconciling the two. The function skips any partition with dependent
        // rows (never cascades), so an accidental enable cannot silently delete referenced documents.
        if (configuration.GetValue<bool?>("PartitionMaintenance:RetentionEnabled") ?? false)
        {
            var retainMonths = configuration.GetValue<int?>("PartitionMaintenance:RetainMonths") ?? 84;
            await db.Database.ExecuteSqlRawAsync(
                "SELECT public.drop_old_partitions({0}, {1}, {2})",
                new object[] { "document", "document", retainMonths }, ct);
            logger.LogInformation(
                "Partition retention drop complete for document.document (retain {Months} months)", retainMonths);
        }
    }
}
