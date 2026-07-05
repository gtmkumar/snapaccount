using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard count for CallbackService — open callbacks.
/// "Open" = anything that's not Completed / Cancelled.
///
/// Org-scoped to the caller's organisation (<see cref="ICurrentUser.OrganizationId"/>), exactly
/// like GET /callbacks (whose endpoint always passes <c>currentUser.OrganizationId</c>). Without
/// this the count was cross-org and included orphaned org_id=Guid.Empty rows, so the dashboard
/// "Open Callbacks" showed 2 while the org-scoped Callbacks list showed 0. Falls back to a
/// platform-wide count only when no org is present in the session.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<CallbackDashboardStats>;

public record CallbackDashboardStats(int OpenCallbacks);

public sealed class GetDashboardStatsQueryHandler(ICallbackDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetDashboardStatsQuery, CallbackDashboardStats>
{
    public async Task<Result<CallbackDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var query = db.Callbacks
            .Where(c => c.DeletedAt == null
                     && c.Status != CallbackStatus.Completed
                     && c.Status != CallbackStatus.Cancelled);

        // Scope to the caller's org so this matches the org-scoped Callbacks list.
        var orgId = currentUser.OrganizationId;
        if (orgId is not null && orgId != Guid.Empty)
            query = query.Where(c => c.OrganizationId == orgId.Value);

        var open = await query.CountAsync(ct);

        return new CallbackDashboardStats(open);
    }
}
