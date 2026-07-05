using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.Dashboard.Queries.GetLoanKpi;

/// <summary>
/// Returns loan application KPI counts for the LoansListPage KpiStrip.
/// Org-scoped: only applications belonging to the caller's org are counted.
/// Response shape matches the <c>LoanKpiSchema</c> Zod schema in <c>src/admin/src/lib/loanApi.ts</c>:
///   { totalApps, submitted, underReview, awaitingDocs, approved, disbursed }
/// </summary>
[RequiresPermission("loan.read")]
public record GetLoanKpiQuery : IQuery<LoanKpiResponse>;

/// <summary>
/// Loan KPI counts — field names match the frontend <c>LoanKpiSchema</c> Zod schema exactly.
/// </summary>
public record LoanKpiResponse(
    int TotalApps,
    int Submitted,
    int UnderReview,
    int AwaitingDocs,
    int Approved,
    int Disbursed);

/// <summary>Handles <see cref="GetLoanKpiQuery"/>.</summary>
public sealed class GetLoanKpiQueryHandler(ILoanServiceDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetLoanKpiQuery, LoanKpiResponse>
{
    /// <inheritdoc />
    public async Task<Result<LoanKpiResponse>> Handle(GetLoanKpiQuery request, CancellationToken ct)
    {
        var orgId = currentUser.OrganizationId;
        if (orgId is null || orgId == Guid.Empty)
            return Result<LoanKpiResponse>.Failure(
                Error.Validation("Loan.MissingOrg",
                    "Organization context missing from session. Complete business onboarding and call POST /auth/token/refresh-context first."));

        // Pull counts in a single DB round-trip using GroupBy on status.
        var counts = await db.LoanApplications
            .Where(a => a.OrgId == orgId.Value && a.DeletedAt == null)
            .GroupBy(a => a.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        int Get(LoanApplicationStatus s) => counts.FirstOrDefault(c => c.Status == s)?.Count ?? 0;

        var totalApps = counts.Sum(c => c.Count);

        return new LoanKpiResponse(
            TotalApps: totalApps,
            Submitted: Get(LoanApplicationStatus.Submitted),
            UnderReview: Get(LoanApplicationStatus.UnderReview),
            AwaitingDocs: Get(LoanApplicationStatus.DocsRequested),
            Approved: Get(LoanApplicationStatus.Approved),
            Disbursed: Get(LoanApplicationStatus.Disbursed));
    }
}
