using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
using LoanService.Domain.ValueObjects;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.GetEligibilityResult;

/// <summary>Re-reads the latest cached eligibility score for an org (non-recomputing read).</summary>
public record GetEligibilityResultQuery(Guid OrgId, Guid? LoanProductId) : IQuery<EligibilityResultDto>;

/// <summary>
/// Eligibility result DTO.
/// DG-LOAN-07: Extended with <see cref="EligibilityStatus"/> (tri-state) and
/// <see cref="UnmetCriteriaByProduct"/> (per-product remediation guidance).
/// <see cref="IsEligible"/> is retained for backward compatibility.
/// </summary>
public record EligibilityResultDto(
    decimal Score,
    bool IsEligible,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<Guid> QualifyingProductIds,
    /// <summary>DG-LOAN-07: Tri-state eligibility status (Eligible/PartiallyEligible/NotEligible).</summary>
    EligibilityStatus EligibilityStatus = EligibilityStatus.NotEligible,
    /// <summary>
    /// DG-LOAN-07: Per-product unmet-criteria strings for non-qualifying products.
    /// Key = product id; value = list of human-readable actions needed to qualify
    /// (e.g. "File GSTR-3B for 3 pending months"). Empty when fully Eligible.
    /// </summary>
    IReadOnlyDictionary<Guid, IReadOnlyList<string>>? UnmetCriteriaByProduct = null);

/// <summary>Handler: computes eligibility (stateless — no cache yet).</summary>
public sealed class GetEligibilityResultQueryHandler(
    ICurrentUser currentUser,
    IEligibilityEngine eligibilityEngine) : IQueryHandler<GetEligibilityResultQuery, EligibilityResultDto>
{
    /// <inheritdoc />
    public async Task<Result<EligibilityResultDto>> Handle(
        GetEligibilityResultQuery request,
        CancellationToken cancellationToken)
    {
        var callerOrgId = currentUser.OrganizationId;
        if (callerOrgId != request.OrgId && !currentUser.HasPermission("loan.admin"))
            return Error.NotFound("Organisation", request.OrgId);

        var score = await eligibilityEngine.ComputeAsync(
            request.OrgId, request.LoanProductId, cancellationToken);

        return new EligibilityResultDto(
            score.Score,
            score.IsEligible,
            score.Reasons,
            score.QualifyingProductIds,
            score.EligibilityStatus,
            score.UnmetCriteriaByProduct);
    }
}
