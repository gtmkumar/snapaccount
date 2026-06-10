using CallbackService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Dashboard.Queries.GetKpiSnapshot;

/// <summary>
/// GAP-012 / SEC-030 / P6-HANDOFF-04: Returns the KPI snapshot for the authenticated user's
/// organisation, queried directly from <c>callback.kpi_daily_snapshot</c> Materialized View.
///
/// P6-HANDOFF-04 IDOR requirement: <c>org_id</c> is ALWAYS taken from the caller's identity
/// (not from the request body/query) to prevent cross-org data leakage.
///
/// Returns a rolling 30-day window plus aggregate totals. FCR (First-Contact Resolution)
/// is computed as <c>completed / total_requested</c>.
/// </summary>
[RequiresPermission("callback.kpi.read")]
public record GetKpiSnapshotQuery(Guid OrganizationId, int DaysBack = 30)
    : IQuery<KpiSnapshotResponse>;

/// <summary>
/// Per-day KPI row returned to the caller.
/// Matches the MV columns in <c>database/migrations/018_callback_schema.sql</c>.
/// </summary>
public record KpiDailyRow(
    DateOnly SnapshotDate,
    long CountPending,
    long CountScheduled,
    long CountInProgress,
    long CountCompleted,
    long CountCancelled,
    long CountEscalated,
    long CountSlaBreached,
    double? AvgTtrMinutes,
    double? AvgCsat,
    long TotalRequested);

/// <summary>Aggregate KPI totals + per-day breakdown for the requested window.</summary>
public record KpiSnapshotResponse(
    Guid OrganizationId,
    int DaysBack,
    long TotalRequested,
    long TotalCompleted,
    long TotalSlaBreached,
    double? OverallFcr,
    double? OverallAvgTtrMinutes,
    double? OverallAvgCsat,
    IReadOnlyList<KpiDailyRow> DailyRows);

/// <summary>Handles <see cref="GetKpiSnapshotQuery"/>.</summary>
public sealed class GetKpiSnapshotQueryHandler(ICallbackDbContext db)
    : IQueryHandler<GetKpiSnapshotQuery, KpiSnapshotResponse>
{
    /// <inheritdoc />
    public async Task<Result<KpiSnapshotResponse>> Handle(
        GetKpiSnapshotQuery request, CancellationToken cancellationToken)
    {
        var since = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-request.DaysBack));

        // P6-HANDOFF-04: Mandatory org filter — MV has no RLS so we filter in LINQ.
        // OrganizationId is sourced from the caller's JWT claims in the endpoint, never from query params.
        var rows = await db.KpiSnapshots
            .Where(s => s.OrgId == request.OrganizationId && s.SnapshotDate >= since)
            .OrderBy(s => s.SnapshotDate)
            .Select(s => new KpiDailyRow(
                s.SnapshotDate,
                s.CountPending,
                s.CountScheduled,
                s.CountInProgress,
                s.CountCompleted,
                s.CountCancelled,
                s.CountEscalated,
                s.CountSlaBreached,
                s.AvgTtrMinutes,
                s.AvgCsat,
                s.TotalRequested))
            .ToListAsync(cancellationToken);

        // Aggregate totals
        var totalRequested = rows.Sum(r => r.TotalRequested);
        var totalCompleted = rows.Sum(r => r.CountCompleted);
        var totalSlaBreached = rows.Sum(r => r.CountSlaBreached);

        double? overallFcr = totalRequested > 0
            ? Math.Round((double)totalCompleted / totalRequested, 4)
            : null;

        double? overallAvgTtr = rows.Any(r => r.AvgTtrMinutes.HasValue)
            ? rows.Where(r => r.AvgTtrMinutes.HasValue).Average(r => r.AvgTtrMinutes!.Value)
            : null;

        double? overallCsat = rows.Any(r => r.AvgCsat.HasValue)
            ? rows.Where(r => r.AvgCsat.HasValue).Average(r => r.AvgCsat!.Value)
            : null;

        return new KpiSnapshotResponse(
            request.OrganizationId,
            request.DaysBack,
            totalRequested,
            totalCompleted,
            totalSlaBreached,
            overallFcr,
            overallAvgTtr.HasValue ? Math.Round(overallAvgTtr.Value, 2) : null,
            overallCsat.HasValue ? Math.Round(overallCsat.Value, 2) : null,
            rows);
    }
}
