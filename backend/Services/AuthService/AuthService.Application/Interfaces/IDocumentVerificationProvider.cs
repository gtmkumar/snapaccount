namespace AuthService.Application.Interfaces;

/// <summary>
/// Abstraction for government identity/tax document verification providers.
/// Generalises the original <see cref="IKycProvider"/> to cover all four document kinds:
/// PAN, AADHAAR, GSTIN, and TAN.
///
/// Each kind supports an OTP send / verify cycle:
/// <list type="bullet">
///   <item>PAN   — one-shot verify (no OTP in real NSDL; mock simulates an OTP cycle).</item>
///   <item>AADHAAR — mandatory OTP via UIDAI (mock logs a dev OTP).</item>
///   <item>GSTIN — one-shot verify via GSTN; mock simulates OTP.</item>
///   <item>TAN   — one-shot verify via NSDL; mock simulates OTP.</item>
/// </list>
///
/// Concrete implementations:
/// <list type="bullet">
///   <item><c>MockDocumentVerificationProvider</c> — always passes for format-valid inputs
///         and logs the dev OTP to the console (local dev / test).</item>
///   <item>Future: UIDAI (Aadhaar) / NSDL (PAN+TAN) / GSTN — drop-in replacements.</item>
/// </list>
///
/// Selected by env var <c>KYC_PROVIDER</c> (default: "mock").
/// </summary>
public interface IDocumentVerificationProvider
{
    /// <summary>
    /// Initiates OTP dispatch for the given document kind + number.
    /// Mock implementation logs a dev OTP and returns a stable transaction id.
    /// </summary>
    /// <param name="kind">Document kind constant from <c>KycKind</c>.</param>
    /// <param name="documentNumber">Validated document number (format-checked by caller).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A <see cref="KycOtpSendResult"/> containing the transaction id.</returns>
    Task<KycOtpSendResult> SendOtpAsync(string kind, string documentNumber, CancellationToken ct = default);

    /// <summary>
    /// Verifies the OTP for the given transaction id.
    /// Mock: OTP "000000" always fails; any other non-empty value succeeds.
    /// </summary>
    /// <param name="kind">Document kind (informational — may influence provider routing).</param>
    /// <param name="transactionId">Transaction id from <see cref="SendOtpAsync"/>.</param>
    /// <param name="otp">OTP entered by the user.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<KycVerifyResult> VerifyOtpAsync(string kind, string transactionId, string otp, CancellationToken ct = default);
}
