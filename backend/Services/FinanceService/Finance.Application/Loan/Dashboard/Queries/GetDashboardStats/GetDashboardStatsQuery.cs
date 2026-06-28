using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard counts for LoanService — applications in non-terminal status.
/// "Active" = anything that isn't Disbursed / Closed / Rejected.
///
/// Org-scoped to the caller's organisation (<see cref="ICurrentUser.OrganizationId"/>), exactly
/// like GET /loans/applications and GET /loans/kpi. Without this the count was cross-org and
/// included orphaned org_id=Guid.Empty rows, so the dashboard "Active Loan Applications" / Loan
/// queue "Total Active" reported 2 while the org's own loans list showed 1. Falls back to a
/// platform-wide count only when no org is present in the session.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<LoanDashboardStats>;

public record LoanDashboardStats(int LoanApplicationsActive);

public sealed class GetDashboardStatsQueryHandler(ILoanServiceDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetDashboardStatsQuery, LoanDashboardStats>
{
    private static readonly LoanApplicationStatus[] TerminalStatuses =
        [LoanApplicationStatus.Disbursed, LoanApplicationStatus.Closed, LoanApplicationStatus.Rejected];

    public async Task<Result<LoanDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var query = db.LoanApplications
            .Where(a => a.DeletedAt == null && !TerminalStatuses.Contains(a.Status));

        // Scope to the caller's org so this matches the org-scoped loans list and /loans/kpi.
        var orgId = currentUser.OrganizationId;
        if (orgId is not null && orgId != Guid.Empty)
            query = query.Where(a => a.OrgId == orgId.Value);

        var active = await query.CountAsync(ct);

        return new LoanDashboardStats(active);
    }
}
