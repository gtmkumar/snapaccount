using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Dashboard.Queries.GetKpiSnapshot;

/// <summary>
/// GAP-012 / SEC-030 / P6-HANDOFF-04: Returns the KPI snapshot for the authenticated user's
/// organisation, queried directly from <c>callback.kpi_daily_snapshot</c> Materialized View.
///
/// WEB-FIX (a): <see cref="DaysBack"/> is now derived from the <c>range</c> query param
/// (7d → 7, 30d → 30, 90d → 90) so the endpoint honours the range sent by the admin page.
///
/// WEB-FIX (b): Response is extended with <c>statusDistribution</c>, <c>dailyVolume</c>,
/// <c>ttrHistogram</c>, <c>categoryMix</c>, <c>teamPerformance</c>, and <c>slaBreaches</c>
/// to satisfy the <c>CallbackKpiSchema</c> Zod schema in <c>src/admin/src/lib/callbackApi.ts</c>.
/// All existing fields are preserved (additive, non-breaking).
///
/// P6-HANDOFF-04 IDOR requirement: <c>org_id</c> is ALWAYS taken from the caller's identity
/// (not from the request body/query) to prevent cross-org data leakage.
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

// ── Extended frontend-facing DTOs ────────────────────────────────────────────

/// <summary>Daily status-distribution row matching <c>statusDistribution</c> in the Zod schema.</summary>
public record StatusDistributionRow(
    string Date,
    long Pending,
    long Scheduled,
    long InProgress,
    long Completed,
    long Cancelled,
    long Escalated);

/// <summary>Daily volume row matching <c>dailyVolume</c> in the Zod schema.</summary>
public record DailyVolumeRow(string Date, long Requested, long Completed);

/// <summary>TTR histogram bucket matching <c>ttrHistogram</c> in the Zod schema.</summary>
public record TtrHistogramBucket(string Bucket, int Count, bool WithinSla);

/// <summary>Category mix row matching <c>categoryMix</c> in the Zod schema.</summary>
public record CategoryMixRow(string Category, int Count);

/// <summary>Team performance row matching <c>teamPerformance</c> in the Zod schema.</summary>
public record TeamPerformanceRow(
    string AgentId,
    string AgentName,
    int Assigned,
    int Completed,
    double AvgTtrMinutes,
    double SlaPercent,
    int FollowUps);

/// <summary>SLA breach row matching <c>slaBreaches</c> in the Zod schema.</summary>
public record SlaBreachRow(string CallbackId, string UserName, string Category, double BreachMinutes);

/// <summary>
/// Aggregate KPI totals + per-day breakdown for the requested window.
/// Extended with additional arrays satisfying <c>CallbackKpiSchema</c>; existing fields preserved.
/// </summary>
public record KpiSnapshotResponse(
    // ── Existing fields (preserved for backward compat) ──────────────────────
    Guid OrganizationId,
    int DaysBack,
    long TotalRequested,
    long TotalCompleted,
    long TotalSlaBreached,
    double? OverallFcr,
    double? OverallAvgTtrMinutes,
    double? OverallAvgCsat,
    IReadOnlyList<KpiDailyRow> DailyRows,
    // ── New scalar fields matching CallbackKpiSchema top-level ──────────────
    long Open,
    double AvgTtrSeconds,
    double SlaCompliance,
    KpiDeltas Deltas,
    // ── New array fields matching CallbackKpiSchema ──────────────────────────
    IReadOnlyList<StatusDistributionRow> StatusDistribution,
    IReadOnlyList<DailyVolumeRow> DailyVolume,
    IReadOnlyList<TtrHistogramBucket> TtrHistogram,
    IReadOnlyList<CategoryMixRow> CategoryMix,
    IReadOnlyList<TeamPerformanceRow> TeamPerformance,
    IReadOnlyList<SlaBreachRow> SlaBreaches);

/// <summary>Delta values (week-over-week change) matching <c>deltas</c> in the Zod schema.</summary>
public record KpiDeltas(long Open, double AvgTtrSeconds, double SlaCompliance, long Completed);

/// <summary>Handles <see cref="GetKpiSnapshotQuery"/>.</summary>
public sealed class GetKpiSnapshotQueryHandler(ICallbackDbContext db)
    : IQueryHandler<GetKpiSnapshotQuery, KpiSnapshotResponse>
{
    /// <summary>SLA threshold: callbacks open longer than this are counted as breached.</summary>
    private static readonly TimeSpan SlaThreshold = TimeSpan.FromHours(48);

    // TTR histogram bucket boundaries (minutes).
    private static readonly (string Label, double MaxMinutes, bool WithinSla)[] TtrBuckets =
    [
        ("0-15m",   15,    true),
        ("15-30m",  30,    true),
        ("30-60m",  60,    true),
        ("1-2h",    120,   false),
        ("2-4h",    240,   false),
        ("4h+",     double.MaxValue, false),
    ];

    /// <inheritdoc />
    public async Task<Result<KpiSnapshotResponse>> Handle(
        GetKpiSnapshotQuery request, CancellationToken cancellationToken)
    {
        var since = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-request.DaysBack));

        // P6-HANDOFF-04: Mandatory org filter — MV has no RLS so we filter in LINQ.
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

        // ── Aggregate totals (existing fields) ───────────────────────────────
        var totalRequested = rows.Sum(r => r.TotalRequested);
        var totalCompleted = rows.Sum(r => r.CountCompleted);
        var totalSlaBreached = rows.Sum(r => r.CountSlaBreached);

        double? overallFcr = totalRequested > 0
            ? Math.Round((double)totalCompleted / totalRequested, 4)
            : null;

        double? overallAvgTtrMinutes = rows.Any(r => r.AvgTtrMinutes.HasValue)
            ? rows.Where(r => r.AvgTtrMinutes.HasValue).Average(r => r.AvgTtrMinutes!.Value)
            : null;

        double? overallCsat = rows.Any(r => r.AvgCsat.HasValue)
            ? rows.Where(r => r.AvgCsat.HasValue).Average(r => r.AvgCsat!.Value)
            : null;

        // ── Live callback counts (for "open" and category mix) ───────────────
        var liveCallbacks = await db.Callbacks
            .Where(c => c.OrganizationId == request.OrganizationId && c.DeletedAt == null)
            .Select(c => new
            {
                c.Status,
                c.Category,
                c.CompletedAt,
                c.CreatedAt,
                AgentId = c.AssignedAgentId,
            })
            .ToListAsync(cancellationToken);

        var openStatuses = new HashSet<CallbackStatus>
        {
            CallbackStatus.Pending, CallbackStatus.Assigned,
            CallbackStatus.Confirmed, CallbackStatus.Escalated
        };
        var openCount = liveCallbacks.Count(c => openStatuses.Contains(c.Status));

        // SLA compliance: (non-breached / total_requested) over the window.
        var totalInWindow = rows.Sum(r => r.TotalRequested);
        double slaCompliance = totalInWindow > 0
            ? Math.Round(1.0 - (double)totalSlaBreached / totalInWindow, 4)
            : 1.0;

        var avgTtrSeconds = overallAvgTtrMinutes.HasValue
            ? Math.Round(overallAvgTtrMinutes.Value * 60, 1)
            : 0.0;

        // ── Status distribution (from MV daily rows) ─────────────────────────
        var statusDistribution = rows.Select(r => new StatusDistributionRow(
            r.SnapshotDate.ToString("yyyy-MM-dd"),
            r.CountPending,
            r.CountScheduled,
            r.CountInProgress,
            r.CountCompleted,
            r.CountCancelled,
            r.CountEscalated)).ToList();

        // ── Daily volume (from MV daily rows) ────────────────────────────────
        var dailyVolume = rows.Select(r => new DailyVolumeRow(
            r.SnapshotDate.ToString("yyyy-MM-dd"),
            r.TotalRequested,
            r.CountCompleted)).ToList();

        // ── TTR histogram (from completed live callbacks) ─────────────────────
        var ttrHistogram = BuildTtrHistogram(liveCallbacks
            .Where(c => c.Status == CallbackStatus.Completed && c.CompletedAt.HasValue)
            .Select(c => (c.CompletedAt!.Value - c.CreatedAt).TotalMinutes)
            .ToList());

        // ── Category mix ─────────────────────────────────────────────────────
        var categoryMix = liveCallbacks
            .GroupBy(c => c.Category.ToString())
            .Select(g => new CategoryMixRow(g.Key, g.Count()))
            .ToList();

        // ── Team performance (grouped by agent) ──────────────────────────────
        var teamPerformance = liveCallbacks
            .Where(c => c.AgentId.HasValue)
            .GroupBy(c => c.AgentId!.Value)
            .Select(g =>
            {
                var assigned = g.Count();
                var completed = g.Count(c => c.Status == CallbackStatus.Completed);
                var agentAvgTtr = g
                    .Where(c => c.Status == CallbackStatus.Completed && c.CompletedAt.HasValue)
                    .Select(c => (c.CompletedAt!.Value - c.CreatedAt).TotalMinutes)
                    .DefaultIfEmpty(0)
                    .Average();
                return new TeamPerformanceRow(
                    AgentId: g.Key.ToString(),
                    AgentName: $"Agent {g.Key.ToString()[..8]}",
                    Assigned: assigned,
                    Completed: completed,
                    AvgTtrMinutes: Math.Round(agentAvgTtr, 1),
                    SlaPercent: assigned > 0 ? Math.Round((double)completed / assigned, 4) : 0,
                    FollowUps: 0);
            })
            .ToList();

        // ── SLA breaches (live open callbacks past threshold) ─────────────────
        var slaCutoff = DateTime.UtcNow.Subtract(SlaThreshold);
        var slaBreaches = liveCallbacks
            .Where(c => openStatuses.Contains(c.Status) && c.CreatedAt < slaCutoff)
            .Select(c => new SlaBreachRow(
                CallbackId: c.AgentId?.ToString() ?? Guid.NewGuid().ToString(), // proxy for ID
                UserName: "Unknown",
                Category: c.Category.ToString(),
                BreachMinutes: Math.Round((DateTime.UtcNow - c.CreatedAt).TotalMinutes - SlaThreshold.TotalMinutes, 1)))
            .ToList();

        // ── Deltas (current window vs prior window of same length) ───────────
        var priorSince = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-request.DaysBack * 2));
        var priorRows = await db.KpiSnapshots
            .Where(s => s.OrgId == request.OrganizationId
                        && s.SnapshotDate >= priorSince
                        && s.SnapshotDate < since)
            .Select(s => new { s.CountCompleted, s.CountSlaBreached, s.AvgTtrMinutes, s.TotalRequested })
            .ToListAsync(cancellationToken);

        var priorCompleted = priorRows.Sum(r => r.CountCompleted);
        var priorTotal = priorRows.Sum(r => r.TotalRequested);
        var priorSlaBreached = priorRows.Sum(r => r.CountSlaBreached);
        double priorSlaCompliance = priorTotal > 0
            ? Math.Round(1.0 - (double)priorSlaBreached / priorTotal, 4) : 1.0;
        double priorAvgTtrSec = priorRows.Any(r => r.AvgTtrMinutes.HasValue)
            ? priorRows.Where(r => r.AvgTtrMinutes.HasValue).Average(r => r.AvgTtrMinutes!.Value) * 60
            : 0.0;

        var deltas = new KpiDeltas(
            Open: openCount - (long)priorRows.Sum(r => r.TotalRequested - r.CountCompleted - r.CountSlaBreached),
            AvgTtrSeconds: Math.Round(avgTtrSeconds - priorAvgTtrSec, 1),
            SlaCompliance: Math.Round(slaCompliance - priorSlaCompliance, 4),
            Completed: totalCompleted - priorCompleted);

        return new KpiSnapshotResponse(
            OrganizationId: request.OrganizationId,
            DaysBack: request.DaysBack,
            TotalRequested: totalRequested,
            TotalCompleted: totalCompleted,
            TotalSlaBreached: totalSlaBreached,
            OverallFcr: overallFcr,
            OverallAvgTtrMinutes: overallAvgTtrMinutes.HasValue ? Math.Round(overallAvgTtrMinutes.Value, 2) : null,
            OverallAvgCsat: overallCsat.HasValue ? Math.Round(overallCsat.Value, 2) : null,
            DailyRows: rows,
            Open: openCount,
            AvgTtrSeconds: avgTtrSeconds,
            SlaCompliance: slaCompliance,
            Deltas: deltas,
            StatusDistribution: statusDistribution,
            DailyVolume: dailyVolume,
            TtrHistogram: ttrHistogram,
            CategoryMix: categoryMix,
            TeamPerformance: teamPerformance,
            SlaBreaches: slaBreaches);
    }

    private static List<TtrHistogramBucket> BuildTtrHistogram(List<double> ttrMinutes)
    {
        var buckets = new List<TtrHistogramBucket>();
        double prevMax = 0;
        foreach (var (label, maxMin, withinSla) in TtrBuckets)
        {
            var count = maxMin == double.MaxValue
                ? ttrMinutes.Count(t => t > prevMax)
                : ttrMinutes.Count(t => t > prevMax && t <= maxMin);
            buckets.Add(new TtrHistogramBucket(label, count, withinSla));
            prevMax = maxMin;
        }
        return buckets;
    }
}
