using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.GetEligibilityResult;

/// <summary>Re-reads the latest cached eligibility score for an org (non-recomputing read).</summary>
public record GetEligibilityResultQuery(Guid OrgId, Guid? LoanProductId) : IQuery<EligibilityResultDto>;

/// <summary>Eligibility result DTO.</summary>
public record EligibilityResultDto(
    decimal Score,
    bool IsEligible,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<Guid> QualifyingProductIds);

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
            score.QualifyingProductIds);
    }
}
