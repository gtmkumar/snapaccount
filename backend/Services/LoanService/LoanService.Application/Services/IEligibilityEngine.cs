using LoanService.Domain.ValueObjects;

namespace LoanService.Application.Services;

/// <summary>
/// Computes the loan eligibility score for an organisation.
/// Reads from AccountingService (P&L, Balance Sheet) and GstService (GSTR-3B returns)
/// via REST cross-service calls. Does NOT read other services' DB tables directly.
/// </summary>
public interface IEligibilityEngine
{
    /// <summary>
    /// Computes the eligibility score for the given organisation.
    /// </summary>
    /// <param name="orgId">Organisation to evaluate.</param>
    /// <param name="loanProductId">Optional: filter qualifying products to this specific product.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Eligibility score with qualifying products and explanation reasons.</returns>
    Task<EligibilityScore> ComputeAsync(Guid orgId, Guid? loanProductId, CancellationToken ct);
}
