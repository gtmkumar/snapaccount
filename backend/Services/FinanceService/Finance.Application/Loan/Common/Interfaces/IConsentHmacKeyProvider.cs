namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Provides the server-side HMAC key used for consent signature computation.
/// P6-HANDOFF-26: key loaded from GCP Secret Manager (secret: loan-consent-hmac-key).
/// </summary>
public interface IConsentHmacKeyProvider
{
    /// <summary>Returns the raw HMAC-SHA256 key bytes from Secret Manager.</summary>
    Task<byte[]> GetKeyAsync(CancellationToken ct = default);
}
