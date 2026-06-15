using LoanService.Application.Services;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// GAP-110: Mock penny-drop verifier for Development and CI.
/// Always returns <see cref="PennyDropResult"/> with <c>IsMatch=true</c> and similarity=0.99
/// so that penny-drop never blocks loan submissions in local dev.
///
/// WARN: This implementation is intentionally never registered in non-Development environments.
/// The real production provider is TL-gated (requires bank API credentials).
/// DependencyInjection.cs logs a startup warning when this mock is active.
/// </summary>
public sealed class MockPennyDropVerifier(ILogger<MockPennyDropVerifier> logger) : IPennyDropVerifier
{
    /// <inheritdoc />
    public Task<Result<PennyDropResult>> VerifyAsync(
        string accountNumber,
        string ifscCode,
        string declaredName,
        CancellationToken cancellationToken)
    {
        logger.LogWarning(
            "[MOCK] PennyDropVerifier: returning stub match for account {Account} IFSC {Ifsc}. " +
            "Real verification is TL-gated. Do NOT deploy this mock in production.",
            MaskAccount(accountNumber), ifscCode);

        return Task.FromResult(
            Result<PennyDropResult>.Success(
                new PennyDropResult(IsMatch: true, BeneficiaryName: "MOCK MATCH", SimilarityScore: 0.99)));
    }

    private static string MaskAccount(string account)
        => account.Length <= 4 ? "****" : new string('*', account.Length - 4) + account[^4..];
}
