using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
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

/// <summary>Eligibility check response.</summary>
public record CheckEligibilityResponse(
    decimal Score,
    bool IsEligible,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<Guid> QualifyingProductIds);

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

        return new CheckEligibilityResponse(
            score.Score,
            score.IsEligible,
            score.Reasons,
            score.QualifyingProductIds);
    }
}
