using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard counts for ItrService — filings that have been FILED but
/// not yet E_VERIFIED (the e-verification window is the bottleneck stat).
/// SUPER_ADMIN only — no org scoping.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<ItrDashboardStats>;

public record ItrDashboardStats(int ItrVerificationsPending);

public sealed class GetDashboardStatsQueryHandler(IItrDbContext db)
    : IQueryHandler<GetDashboardStatsQuery, ItrDashboardStats>
{
    public async Task<Result<ItrDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var pending = await db.Filings
            .Where(f => f.DeletedAt == null && f.Status == "FILED")
            .CountAsync(ct);

        return new ItrDashboardStats(pending);
    }
}
