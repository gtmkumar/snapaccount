using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Application.LoanApplications.Commands.RunFraudChecks;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.GetFraudSummary;

/// <summary>
/// GAP-110: Returns fraud check results for a specific loan application.
/// Permission: operator-tier (loan.fraud.view).
/// Never leaks other-org PII — returns only aggregate counts stored in the decision log.
/// </summary>
[RequiresPermission("loan.fraud.view")]
public record GetFraudSummaryQuery(Guid ApplicationId) : IQuery<FraudSummaryResponse>;

/// <summary>Full fraud summary for operator review.</summary>
public record FraudSummaryResponse(
    Guid ApplicationId,
    bool HasFailures,
    bool HasFlags,
    bool AllPassed,
    IReadOnlyList<FraudCheckDetailDto> Checks);

/// <summary>Detail row per check in the operator fraud review view.</summary>
public record FraudCheckDetailDto(
    Guid Id,
    string CheckType,
    string Verdict,
    string DecisionNote,
    DateTime CheckedAt);

/// <summary>Validates GetFraudSummaryQuery.</summary>
public sealed class GetFraudSummaryQueryValidator : AbstractValidator<GetFraudSummaryQuery>
{
    public GetFraudSummaryQueryValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
    }
}

/// <summary>Projects fraud check rows for an application — org-scoped for IDOR safety.</summary>
public sealed class GetFraudSummaryQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetFraudSummaryQuery, FraudSummaryResponse>
{
    /// <inheritdoc />
    public async Task<Result<FraudSummaryResponse>> Handle(
        GetFraudSummaryQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Result<FraudSummaryResponse>.Failure(
                Error.Validation("LoanApplication.NoOrg", "User is not associated with an organisation."));

        // IDOR: verify application belongs to caller's org before returning fraud data
        var applicationExists = await db.LoanApplications
            .AnyAsync(a => a.Id == request.ApplicationId && a.OrgId == orgId.Value && a.DeletedAt == null,
                cancellationToken);
        if (!applicationExists)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var checks = await db.FraudChecks
            .Where(fc => fc.ApplicationId == request.ApplicationId)
            .OrderBy(fc => fc.CheckedAt)
            .Select(fc => new FraudCheckDetailDto(
                fc.Id,
                fc.CheckType.ToString(),
                fc.Verdict.ToString(),
                fc.DecisionNote,
                fc.CheckedAt))
            .ToListAsync(cancellationToken);

        var hasFailures = checks.Any(c => c.Verdict == FraudVerdict.Fail.ToString());
        var hasFlags = checks.Any(c => c.Verdict == FraudVerdict.Flag.ToString());

        return new FraudSummaryResponse(
            request.ApplicationId,
            HasFailures: hasFailures,
            HasFlags: hasFlags,
            AllPassed: !hasFailures && !hasFlags,
            Checks: checks.AsReadOnly());
    }
}
