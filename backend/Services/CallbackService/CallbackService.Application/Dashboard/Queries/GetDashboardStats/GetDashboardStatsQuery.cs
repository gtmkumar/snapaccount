using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard counts for CallbackService — open callbacks across all orgs.
/// "Open" = anything that's not Completed / Cancelled.
/// SUPER_ADMIN only — no org scoping.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<CallbackDashboardStats>;

public record CallbackDashboardStats(int OpenCallbacks);

public sealed class GetDashboardStatsQueryHandler(ICallbackDbContext db)
    : IQueryHandler<GetDashboardStatsQuery, CallbackDashboardStats>
{
    public async Task<Result<CallbackDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var open = await db.Callbacks
            .Where(c => c.DeletedAt == null
                     && c.Status != CallbackStatus.Completed
                     && c.Status != CallbackStatus.Cancelled)
            .CountAsync(ct);

        return new CallbackDashboardStats(open);
    }
}
