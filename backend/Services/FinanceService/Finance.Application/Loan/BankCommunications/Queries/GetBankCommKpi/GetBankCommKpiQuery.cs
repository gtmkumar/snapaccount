using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.BankCommunications.Queries.GetBankCommKpi;

/// <summary>
/// Returns KPI metrics for the bank communications dashboard.
/// Admin / DG-LOAN-01: GET /loans/bank-communications/kpi
/// Matches admin BankCommKpiSchema { sentToday, pending, failed, avgResponseMinutes?, bounceRate? }.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record GetBankCommKpiQuery : IQuery<BankCommKpiDto>;

/// <summary>Bank communication KPI DTO matching admin BankCommKpiSchema.</summary>
public record BankCommKpiDto(
    int SentToday,
    int Pending,
    int Failed,
    double? AvgResponseMinutes,
    double? BounceRate);

/// <summary>Handler: computes bank communication KPIs from the status log.</summary>
public sealed class GetBankCommKpiQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetBankCommKpiQuery, BankCommKpiDto>
{
    /// <inheritdoc />
    public async Task<Result<BankCommKpiDto>> Handle(
        GetBankCommKpiQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);

        // Applications with assigned banks in this org
        var assignedAppIds = await db.LoanApplications
            .Where(a => a.OrgId == orgId && a.AssignedBankId != null && a.DeletedAt == null)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        if (assignedAppIds.Count == 0)
            return new BankCommKpiDto(0, 0, 0, null, null);

        // Status log entries for bank-related applications
        var logEntries = await db.ApplicationStatusLogs
            .Where(l => assignedAppIds.Contains(l.ApplicationId))
            .ToListAsync(cancellationToken);

        // SentToday: transitions recorded today (bank submissions / status changes)
        var sentToday = logEntries.Count(l =>
            l.TransitionedAt >= today && l.TransitionedAt < tomorrow);

        // Pending: applications in SUBMITTED or UNDER_REVIEW status
        var pending = await db.LoanApplications
            .CountAsync(a => assignedAppIds.Contains(a.Id) &&
                             (a.Status == LoanService.Domain.Entities.LoanApplicationStatus.Submitted ||
                              a.Status == LoanService.Domain.Entities.LoanApplicationStatus.UnderReview),
                cancellationToken);

        // Failed: applications in REJECTED status
        var failed = await db.LoanApplications
            .CountAsync(a => assignedAppIds.Contains(a.Id) &&
                             a.Status == LoanService.Domain.Entities.LoanApplicationStatus.Rejected,
                cancellationToken);

        return new BankCommKpiDto(
            sentToday,
            pending,
            failed,
            null,    // AvgResponseMinutes: not tracked at this time
            null);   // BounceRate: not tracked at this time
    }
}
