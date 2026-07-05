using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain.ValueObjects;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Mock KYC provider — selected when env var <c>KYC_PROVIDER=mock</c> (the default).
/// PAN verification: passes all format-valid PANs (format checked via <see cref="PanNumber"/>).
/// Aadhaar OTP: generates a random 6-digit dev OTP, logs it, returns a transaction id.
/// Allows the real UIDAI/NSDL provider to drop in without changing handlers.
/// </summary>
public sealed class MockKycProvider(ILogger<MockKycProvider> logger) : IKycProvider
{
    /// <summary>
    /// Verifies PAN format. Returns VERIFIED for valid format, FAILED otherwise.
    /// The mock never calls any external API.
    /// </summary>
    public Task<KycVerifyResult> VerifyPanAsync(string pan, string? nameOnPan, CancellationToken ct = default)
    {
        var panResult = PanNumber.Create(pan);
        if (panResult.IsSuccess)
        {
            logger.LogInformation("MockKycProvider: PAN {Pan} format valid → VERIFIED.", pan);
            return Task.FromResult(new KycVerifyResult(KycStatus.Verified, $"MOCK-PAN-{pan}"));
        }

        logger.LogWarning("MockKycProvider: PAN {Pan} format invalid → FAILED.", pan);
        return Task.FromResult(new KycVerifyResult(KycStatus.Failed));
    }

    /// <summary>
    /// Mock GSTIN verification — returns verified with placeholder business-profile fields.
    /// DG-AUTH-04: allows BusinessProfileWizardScreen auto-fill to work in dev without real KYC credentials.
    /// </summary>
    public Task<GstinVerifyResult> VerifyGstinAsync(string gstin, CancellationToken ct = default)
    {
        logger.LogInformation("MockKycProvider: GSTIN {Gstin} → VERIFIED (mock).", gstin);
        return Task.FromResult(new GstinVerifyResult(
            Verified: true,
            LegalName: $"Mock Business Pvt Ltd ({gstin[..2]})",
            TradeName: $"Mock Trade ({gstin[..2]})",
            PrincipalPlaceOfBusiness: "123, Mock Street, Mock City, India",
            ProviderRef: $"MOCK-GSTIN-{gstin}"));
    }

    /// <summary>
    /// Generates a random 6-digit dev OTP and logs it. Returns a UUID transaction id.
    /// In production this would call UIDAI's OTP dispatch API.
    /// </summary>
    public Task<KycOtpSendResult> SendAadhaarOtpAsync(string aadhaar, CancellationToken ct = default)
    {
        var transactionId = Guid.NewGuid().ToString("N");
        var devOtp = Random.Shared.Next(100000, 999999).ToString();

        // Store the dev OTP keyed by transactionId so VerifyAadhaarOtp can look it up.
        // This is purely in-process for mock testing — no persistence needed.
        MockOtpStore.Set(transactionId, devOtp);

        logger.LogWarning(
            "MockKycProvider: Aadhaar OTP dispatched. TransactionId={TxId}  DEV_OTP={Otp}  (use this OTP to verify)",
            transactionId, devOtp);

        return Task.FromResult(new KycOtpSendResult(transactionId));
    }

    /// <summary>
    /// Verifies the OTP against the in-memory dev store.
    /// Returns VERIFIED when the OTP matches, FAILED otherwise.
    /// </summary>
    public Task<KycVerifyResult> VerifyAadhaarOtpAsync(string transactionId, string otp, CancellationToken ct = default)
    {
        if (MockOtpStore.Verify(transactionId, otp))
        {
            logger.LogInformation("MockKycProvider: Aadhaar OTP verified. TxId={TxId}", transactionId);
            return Task.FromResult(new KycVerifyResult(KycStatus.Verified, transactionId));
        }

        logger.LogWarning("MockKycProvider: Aadhaar OTP mismatch. TxId={TxId}", transactionId);
        return Task.FromResult(new KycVerifyResult(KycStatus.Failed));
    }
}

/// <summary>
/// Very simple in-process OTP store for the mock KYC provider.
/// Not suitable for multi-instance deployments — the mock provider is local dev only.
/// </summary>
internal static class MockOtpStore
{
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _store = new();

    internal static void Set(string transactionId, string otp) =>
        _store[transactionId] = otp;

    /// <summary>Returns true and removes the entry on success (single-use).</summary>
    internal static bool Verify(string transactionId, string otp)
    {
        if (_store.TryGetValue(transactionId, out var stored) && stored == otp)
        {
            _store.TryRemove(transactionId, out _);
            return true;
        }
        return false;
    }
}
