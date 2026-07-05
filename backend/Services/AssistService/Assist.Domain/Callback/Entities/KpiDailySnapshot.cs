namespace CallbackService.Domain.Entities;

/// <summary>
/// Read model for <c>callback.kpi_daily_snapshot</c> — a PostgreSQL Materialized View
/// that aggregates per-org daily callback KPIs.
///
/// This is a keyless entity (no PK column in the MV); EF Core maps it read-only.
/// The MV is refreshed by a scheduled Cloud Scheduler / Hangfire job (devops-engineer scope).
///
/// Columns conform to the MV definition in <c>database/migrations/018_callback_schema.sql</c>.
/// </summary>
public class KpiDailySnapshot
{
    /// <summary>Organisation this snapshot belongs to.</summary>
    public Guid OrgId { get; init; }

    /// <summary>Calendar date (IST, stored as date) of this daily row.</summary>
    public DateOnly SnapshotDate { get; init; }

    /// <summary>Callbacks in PENDING state during this day.</summary>
    public long CountPending { get; init; }

    /// <summary>Callbacks in SCHEDULED state during this day.</summary>
    public long CountScheduled { get; init; }

    /// <summary>Callbacks in IN_PROGRESS state during this day.</summary>
    public long CountInProgress { get; init; }

    /// <summary>Callbacks completed during this day.</summary>
    public long CountCompleted { get; init; }

    /// <summary>Callbacks cancelled during this day.</summary>
    public long CountCancelled { get; init; }

    /// <summary>Callbacks escalated during this day.</summary>
    public long CountEscalated { get; init; }

    /// <summary>Number of callbacks where SLA was breached during this day.</summary>
    public long CountSlaBreached { get; init; }

    /// <summary>Average time-to-resolution in minutes for completed callbacks (null when zero completed).</summary>
    public double? AvgTtrMinutes { get; init; }

    /// <summary>Average CSAT score (1–5 scale) for this day (null when no scores yet).</summary>
    public double? AvgCsat { get; init; }

    /// <summary>Total callbacks requested in this period.</summary>
    public long TotalRequested { get; init; }
}
