namespace SnapAccount.Shared.Infrastructure.Messaging;

/// <summary>
/// GAP-113: per-composite handler that creates upcoming monthly partitions for the
/// time-partitioned table(s) a composite owns. Invoked by
/// <see cref="PartitionMaintenanceSubscriber"/> on the monthly PARTITION_MAINTENANCE
/// recurring job. Implementations call <c>public.create_monthly_partitions(schema, table, n)</c>
/// (migration 090) so rows land in proper per-month partitions instead of the DEFAULT one.
/// </summary>
public interface IPartitionMaintenanceHandler
{
    /// <summary>Creates the upcoming monthly partitions for this composite's owned table(s).</summary>
    Task RunAsync(CancellationToken ct);
}
