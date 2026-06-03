namespace AuthService.Application.Interfaces;

/// <summary>
/// KYC provider abstraction. Concrete implementations:
/// <list type="bullet">
///   <item><c>MockKycProvider</c> — always passes format-valid inputs (local dev / test).</item>
///   <item>Future: UIDAI (Aadhaar) / NSDL (PAN) — drop-in replacement, no handler changes needed.</item>
/// </list>
/// Selected by env var <c>KYC_PROVIDER</c> (default: "mock").
/// </summary>
public interface IKycProvider
{
    /// <summary>
    /// Verifies a PAN number format and returns a result.
    /// Returns <see cref="KycVerifyResult.Verified"/> when the format passes.
    /// </summary>
    Task<KycVerifyResult> VerifyPanAsync(string pan, string? nameOnPan, CancellationToken ct = default);

    /// <summary>
    /// Initiates Aadhaar OTP send. Returns a transaction id for follow-up verification.
    /// Mock implementation logs a dev OTP code.
    /// </summary>
    Task<KycOtpSendResult> SendAadhaarOtpAsync(string aadhaar, CancellationToken ct = default);

    /// <summary>Verifies the OTP against the transaction returned by <see cref="SendAadhaarOtpAsync"/>.</summary>
    Task<KycVerifyResult> VerifyAadhaarOtpAsync(string transactionId, string otp, CancellationToken ct = default);
}

/// <summary>Result of a KYC verification attempt.</summary>
/// <param name="Status">One of "VERIFIED" or "FAILED".</param>
/// <param name="ProviderRef">Provider-side reference id (may be null for mock).</param>
public record KycVerifyResult(string Status, string? ProviderRef = null);

/// <summary>Result of an Aadhaar OTP dispatch.</summary>
/// <param name="TransactionId">Opaque id to pass back on OTP verify.</param>
public record KycOtpSendResult(string TransactionId);
