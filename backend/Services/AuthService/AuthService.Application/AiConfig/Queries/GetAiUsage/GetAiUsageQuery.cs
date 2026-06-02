using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Queries.GetAiUsage;

/// <summary>Aggregated AI usage for the current calendar month (drives the admin metric cards).</summary>
public record GetAiUsageQuery(DateTime? NowUtc = null) : IQuery<AiUsageDto>;

public record ModelUsageDto(string Provider, string Model, int Calls, decimal CostUsd);

public record AiUsageDto(
    int CallsThisMonth,
    decimal EstimatedCostUsd,
    int AvgResponseMs,
    IReadOnlyList<ModelUsageDto> ByModel);

public sealed class GetAiUsageQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetAiUsageQuery, AiUsageDto>
{
    public async Task<Result<AiUsageDto>> Handle(GetAiUsageQuery request, CancellationToken ct)
    {
        // Month start (UTC). NowUtc is injectable for testing; defaults to the wall clock.
        var now = request.NowUtc ?? DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        // Pull the month's rows (small in practice) and aggregate in memory — avoids provider-
        // specific SQL aggregate translation quirks and keeps the logic simple/robust.
        var rows = await db.AiUsageLogs.AsNoTracking()
            .Where(u => u.DeletedAt == null && u.CreatedAt >= monthStart)
            .Select(u => new { u.Provider, u.Model, u.CostUsd, u.LatencyMs })
            .ToListAsync(ct);

        if (rows.Count == 0)
            return new AiUsageDto(0, 0m, 0, []);

        var cost = rows.Sum(r => r.CostUsd);
        var avgLatency = rows.Average(r => r.LatencyMs);

        var byModel = rows
            .GroupBy(r => new { r.Provider, r.Model })
            .Select(g => new ModelUsageDto(g.Key.Provider, g.Key.Model, g.Count(), g.Sum(x => x.CostUsd)))
            .OrderByDescending(m => m.CostUsd)
            .ToList();

        return new AiUsageDto(rows.Count, Math.Round(cost, 2), (int)Math.Round(avgLatency), byModel);
    }
}
