using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Mock document verification provider for local dev and testing.
/// Selected when <c>KYC_PROVIDER=mock</c> (the default).
///
/// OTP behaviour:
/// <list type="bullet">
///   <item>SendOtpAsync — generates a deterministic 6-digit OTP and logs it at INFO level.</item>
///   <item>VerifyOtpAsync — OTP "000000" always fails; any other value succeeds.</item>
/// </list>
///
/// This provider also implements <see cref="IKycProvider"/> (the legacy interface) to keep
/// the existing /auth/me/kyc/* endpoints working without any handler changes.
/// </summary>
public sealed class MockDocumentVerificationProvider(ILogger<MockDocumentVerificationProvider> logger)
    : IDocumentVerificationProvider, IKycProvider
{
    /// <inheritdoc />
    public string ProviderName => "mock";

    // ── IDocumentVerificationProvider ────────────────────────────────────────

    /// <inheritdoc />
    public Task<KycOtpSendResult> SendOtpAsync(string kind, string documentNumber, CancellationToken ct = default)
    {
        var transactionId = $"MOCK-{kind}-{Guid.NewGuid():N}";
        var devOtp = GenerateDevOtp(documentNumber);

        // SEC note: log level INFO is suppressed in production log sinks (structured logging);
        // this message is intentionally dev-only.
        logger.LogInformation(
            "[DEV-MOCK] Document OTP for kind={Kind} number={Number}: OTP={Otp} transactionId={TxId}",
            kind, MaskForLog(kind, documentNumber), devOtp, transactionId);

        return Task.FromResult(new KycOtpSendResult(transactionId));
    }

    /// <inheritdoc />
    public Task<KycVerifyResult> VerifyOtpAsync(string kind, string transactionId, string otp, CancellationToken ct = default)
    {
        // OTP "000000" is the canonical failure code; everything else succeeds.
        var status = otp == "000000" ? KycStatus.Failed : KycStatus.Verified;
        var providerRef = status == KycStatus.Verified ? transactionId : null;
        return Task.FromResult(new KycVerifyResult(status, providerRef));
    }

    // ── IKycProvider (legacy — keeps /auth/me/kyc/* endpoints working) ────────

    /// <inheritdoc />
    public Task<KycVerifyResult> VerifyPanAsync(string pan, string? nameOnPan, CancellationToken ct = default)
    {
        logger.LogInformation("[DEV-MOCK] PAN verify: pan={Pan}", pan);
        return Task.FromResult(new KycVerifyResult(KycStatus.Verified, $"MOCK-PAN-{pan}"));
    }

    /// <inheritdoc />
    public Task<KycOtpSendResult> SendAadhaarOtpAsync(string aadhaar, CancellationToken ct = default)
        => SendOtpAsync(KycKind.Aadhaar, aadhaar, ct);

    /// <inheritdoc />
    public Task<KycVerifyResult> VerifyAadhaarOtpAsync(string transactionId, string otp, CancellationToken ct = default)
        => VerifyOtpAsync(KycKind.Aadhaar, transactionId, otp, ct);

    /// <summary>
    /// Mock GSTIN verification — returns verified with placeholder business-profile fields (DG-AUTH-04).
    /// </summary>
    public Task<GstinVerifyResult> VerifyGstinAsync(string gstin, CancellationToken ct = default)
    {
        logger.LogInformation("[DEV-MOCK] GSTIN verify: gstin={Gstin} → VERIFIED", gstin);
        return Task.FromResult(new GstinVerifyResult(
            Verified: true,
            LegalName: $"Mock Business Pvt Ltd ({gstin[..2]})",
            TradeName: $"Mock Trade ({gstin[..2]})",
            PrincipalPlaceOfBusiness: "123, Mock Street, Mock City, India",
            ProviderRef: $"MOCK-GSTIN-{gstin}"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>Generates a stable 6-digit dev OTP seeded from the document number.</summary>
    private static string GenerateDevOtp(string documentNumber)
    {
        var hash = Math.Abs(documentNumber.GetHashCode()) % 1_000_000;
        return hash.ToString("D6");
    }

    /// <summary>Masks the document number before logging (DPDP Act 2023 — no full Aadhaar in logs).</summary>
    private static string MaskForLog(string kind, string documentNumber) =>
        kind == KycKind.Aadhaar && documentNumber.Length == 12
            ? $"XXXX-XXXX-{documentNumber[^4..]}"
            : documentNumber;
}
