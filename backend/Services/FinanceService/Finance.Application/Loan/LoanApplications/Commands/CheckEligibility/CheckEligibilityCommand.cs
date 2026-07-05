using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
using LoanService.Domain.ValueObjects;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.CheckEligibility;

/// <summary>
/// Triggers the eligibility engine for a given organisation and optional loan product.
/// Reads from AccountingService (P&L, Balance Sheet) and GstService (GSTR-3B returns)
/// via cross-service REST calls. Does NOT read other services' DB tables directly.
/// </summary>
[RequiresPermission("loan.eligibility.check")]
public record CheckEligibilityCommand(
    Guid OrgId,
    Guid? LoanProductId) : ICommand<CheckEligibilityResponse>;

/// <summary>
/// Eligibility check response.
/// DG-LOAN-07: Extended with <see cref="EligibilityStatus"/> (tri-state) and
/// <see cref="UnmetCriteriaByProduct"/> (per-product remediation guidance).
/// <see cref="IsEligible"/> is retained for backward compatibility.
/// </summary>
public record CheckEligibilityResponse(
    decimal Score,
    bool IsEligible,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<Guid> QualifyingProductIds,
    /// <summary>DG-LOAN-07: Tri-state eligibility status (Eligible/PartiallyEligible/NotEligible).</summary>
    EligibilityStatus EligibilityStatus = EligibilityStatus.NotEligible,
    /// <summary>
    /// DG-LOAN-07: Per-product unmet-criteria strings for non-qualifying products.
    /// Key = product id; value = list of human-readable actions needed to qualify.
    /// Empty when fully Eligible.
    /// </summary>
    IReadOnlyDictionary<Guid, IReadOnlyList<string>>? UnmetCriteriaByProduct = null);

/// <summary>Validates CheckEligibilityCommand.</summary>
public sealed class CheckEligibilityCommandValidator : AbstractValidator<CheckEligibilityCommand>
{
    public CheckEligibilityCommandValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
    }
}

/// <summary>Handler: delegates to EligibilityEngine with IDOR org-scoping.</summary>
public sealed class CheckEligibilityCommandHandler(
    ICurrentUser currentUser,
    IEligibilityEngine eligibilityEngine) : ICommandHandler<CheckEligibilityCommand, CheckEligibilityResponse>
{
    /// <inheritdoc />
    public async Task<Result<CheckEligibilityResponse>> Handle(
        CheckEligibilityCommand request,
        CancellationToken cancellationToken)
    {
        // IDOR: users can only check eligibility for their own org
        var callerOrgId = currentUser.OrganizationId;
        if (callerOrgId != request.OrgId && !currentUser.HasPermission("loan.admin"))
            return Error.NotFound("Organisation", request.OrgId);

        var score = await eligibilityEngine.ComputeAsync(
            request.OrgId, request.LoanProductId, cancellationToken);

        // DG-LOAN-07: surface the tri-state EligibilityStatus and per-product unmet criteria.
        return new CheckEligibilityResponse(
            score.Score,
            score.IsEligible,
            score.Reasons,
            score.QualifyingProductIds,
            score.EligibilityStatus,
            score.UnmetCriteriaByProduct);
    }
}
