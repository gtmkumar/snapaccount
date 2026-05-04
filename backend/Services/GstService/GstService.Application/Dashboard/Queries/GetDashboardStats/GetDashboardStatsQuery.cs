using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard counts for GstService — returns whose filing deadline is today
/// (and not yet FILED). SYSTEM_ADMIN only — no org scoping.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<GstDashboardStats>;

public record GstDashboardStats(int GstReturnsDueToday);

public sealed class GetDashboardStatsQueryHandler(IGstDbContext db)
    : IQueryHandler<GetDashboardStatsQuery, GstDashboardStats>
{
    public async Task<Result<GstDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var dueToday = await db.GstReturns
            .Where(r => r.DeletedAt == null
                     && r.Status != "FILED"
                     && r.FilingDeadline == today)
            .CountAsync(ct);

        return new GstDashboardStats(dueToday);
    }
}
