using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NotificationService.Infrastructure.Persistence;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace NotificationService.Infrastructure.Messaging;

/// <summary>
/// GAP-113: maintains monthly partitions for <c>notification.notification</c> (Platform-owned).
/// Invoked monthly by <see cref="PartitionMaintenanceSubscriber"/>. Idempotent — safe to
/// run repeatedly; <c>create_monthly_partitions</c> skips months that already have a partition.
/// </summary>
public sealed class NotificationPartitionMaintenanceHandler(
    NotificationServiceDbContext db,
    IConfiguration configuration,
    ILogger<NotificationPartitionMaintenanceHandler> logger) : IPartitionMaintenanceHandler
{
    /// <inheritdoc />
    public async Task RunAsync(CancellationToken ct)
    {
        var monthsAhead = configuration.GetValue<int?>("PartitionMaintenance:MonthsAhead") ?? 6;

        await db.Database.ExecuteSqlRawAsync(
            "SELECT public.create_monthly_partitions({0}, {1}, {2})",
            new object[] { "notification", "notification", monthsAhead }, ct);

        logger.LogInformation(
            "Partition maintenance complete for notification.notification (+{Months} months ahead)", monthsAhead);

        // GAP-113: retention drop is OFF by default — DESTRUCTIVE. notification.notification is the
        // natural candidate (transient; notification_log references it by value, no enforced FK), but
        // dropping is still gated so ops opt in deliberately and pick the retain window.
        if (configuration.GetValue<bool?>("PartitionMaintenance:RetentionEnabled") ?? false)
        {
            var retainMonths = configuration.GetValue<int?>("PartitionMaintenance:RetainMonths") ?? 84;
            await db.Database.ExecuteSqlRawAsync(
                "SELECT public.drop_old_partitions({0}, {1}, {2})",
                new object[] { "notification", "notification", retainMonths }, ct);
            logger.LogInformation(
                "Partition retention drop complete for notification.notification (retain {Months} months)", retainMonths);
        }
    }
}
