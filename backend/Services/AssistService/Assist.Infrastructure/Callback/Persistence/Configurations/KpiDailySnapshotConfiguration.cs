using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CallbackService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="KpiDailySnapshot"/>.
/// Maps to the <c>callback.kpi_daily_snapshot</c> Materialized View.
/// Keyless entity — no insert/update/delete allowed by EF Core.
/// </summary>
public sealed class KpiDailySnapshotConfiguration : IEntityTypeConfiguration<KpiDailySnapshot>
{
    public void Configure(EntityTypeBuilder<KpiDailySnapshot> builder)
    {
        // Materialized views are keyless — EF Core treats them as read-only projections.
        builder.HasNoKey();
        builder.ToView("kpi_daily_snapshot", "callback");

        builder.Property(e => e.OrgId).HasColumnName("org_id");
        builder.Property(e => e.SnapshotDate).HasColumnName("snapshot_date");
        builder.Property(e => e.CountPending).HasColumnName("count_pending");
        builder.Property(e => e.CountScheduled).HasColumnName("count_scheduled");
        builder.Property(e => e.CountInProgress).HasColumnName("count_in_progress");
        builder.Property(e => e.CountCompleted).HasColumnName("count_completed");
        builder.Property(e => e.CountCancelled).HasColumnName("count_cancelled");
        builder.Property(e => e.CountEscalated).HasColumnName("count_escalated");
        builder.Property(e => e.CountSlaBreached).HasColumnName("count_sla_breached");
        builder.Property(e => e.AvgTtrMinutes).HasColumnName("avg_ttr_minutes");
        builder.Property(e => e.AvgCsat).HasColumnName("avg_csat");
        builder.Property(e => e.TotalRequested).HasColumnName("total_requested");
    }
}
