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
/// SYSTEM_ADMIN only — no org scoping.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<LoanDashboardStats>;

public record LoanDashboardStats(int LoanApplicationsActive);

public sealed class GetDashboardStatsQueryHandler(ILoanServiceDbContext db)
    : IQueryHandler<GetDashboardStatsQuery, LoanDashboardStats>
{
    private static readonly LoanApplicationStatus[] TerminalStatuses =
        [LoanApplicationStatus.Disbursed, LoanApplicationStatus.Closed, LoanApplicationStatus.Rejected];

    public async Task<Result<LoanDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var active = await db.LoanApplications
            .Where(a => a.DeletedAt == null && !TerminalStatuses.Contains(a.Status))
            .CountAsync(ct);

        return new LoanDashboardStats(active);
    }
}
