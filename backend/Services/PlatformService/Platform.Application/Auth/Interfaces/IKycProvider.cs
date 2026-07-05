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

    /// <summary>
    /// Verifies a GSTIN and returns verification status plus business-profile fields
    /// (legalName, tradeName, principalPlaceOfBusiness) for auto-fill in the onboarding wizard.
    /// DG-AUTH-04.
    /// </summary>
    Task<GstinVerifyResult> VerifyGstinAsync(string gstin, CancellationToken ct = default);
}

/// <summary>Result of a KYC verification attempt.</summary>
/// <param name="Status">One of "VERIFIED" or "FAILED".</param>
/// <param name="ProviderRef">Provider-side reference id (may be null for mock).</param>
public record KycVerifyResult(string Status, string? ProviderRef = null);

/// <summary>Result of an Aadhaar OTP dispatch.</summary>
/// <param name="TransactionId">Opaque id to pass back on OTP verify.</param>
public record KycOtpSendResult(string TransactionId);

/// <summary>
/// Result of a GSTIN verification lookup (DG-AUTH-04).
/// Business-profile fields are populated on success and can be used to auto-fill the onboarding wizard.
/// </summary>
/// <param name="Verified">True when the GSTIN is active and verified with the government registry.</param>
/// <param name="LegalName">Legal (registered) business name from the GSTN registry.</param>
/// <param name="TradeName">Trade name (if different from legal name) from the GSTN registry.</param>
/// <param name="PrincipalPlaceOfBusiness">Registered principal place of business address.</param>
/// <param name="ProviderRef">Provider-side reference / transaction id.</param>
public record GstinVerifyResult(
    bool Verified,
    string? LegalName = null,
    string? TradeName = null,
    string? PrincipalPlaceOfBusiness = null,
    string? ProviderRef = null);
