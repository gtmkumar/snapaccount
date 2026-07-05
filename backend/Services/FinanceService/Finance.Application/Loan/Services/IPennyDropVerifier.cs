using SnapAccount.Shared.Domain;

namespace LoanService.Application.Services;

/// <summary>
/// GAP-110: Verifies that the bank-account holder's name matches the applicant's declared name
/// by performing a small penny-drop transaction and reading the beneficiary name returned.
///
/// Production provider is TL-gated (requires a live banking API key from orchestrator).
/// Use <see cref="MockPennyDropVerifier"/> for Development/CI environments.
/// </summary>
public interface IPennyDropVerifier
{
    /// <summary>
    /// Verifies the name match for an applicant.
    /// </summary>
    /// <param name="accountNumber">Bank account number to penny-drop.</param>
    /// <param name="ifscCode">IFSC code of the branch.</param>
    /// <param name="declaredName">Name as declared on the loan application.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>
    /// <see cref="PennyDropResult"/> with <see cref="PennyDropResult.IsMatch"/> true when names
    /// align within the configured similarity threshold; false otherwise.
    /// Returns <see cref="Result{T}.Failure"/> when the provider is unavailable — callers
    /// MUST treat this as <c>Flag</c> (not Fail) to avoid blocking on transient outages.
    /// </returns>
    Task<Result<PennyDropResult>> VerifyAsync(
        string accountNumber,
        string ifscCode,
        string declaredName,
        CancellationToken cancellationToken);
}

/// <summary>Result of a penny-drop name verification.</summary>
/// <param name="IsMatch">True when the bank-returned name matches the declared name.</param>
/// <param name="BeneficiaryName">Sanitised bank-returned name (PII — never included in cross-org counts).</param>
/// <param name="SimilarityScore">Optional similarity score [0.0, 1.0] when fuzzy-matching is used.</param>
public record PennyDropResult(bool IsMatch, string BeneficiaryName, double SimilarityScore);
