using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Stub for Google Play Integrity API verification (Android).
/// Activated when <c>DeviceIntegrity:Provider=play_integrity</c>.
///
/// Production wiring requires:
/// <list type="bullet">
///   <item><c>DeviceIntegrity:PlayIntegrity:ServiceAccountJson</c> — GCP service-account JSON with Play Integrity API access.</item>
///   <item><c>DeviceIntegrity:PlayIntegrity:PackageName</c> — the Android application package name.</item>
/// </list>
/// When credentials are absent, returns <see cref="DeviceIntegrityVerdict.NotConfigured"/> (never throws).
/// Following the KYC adapter pattern — swap in production by setting the config keys via GCP Secret Manager.
/// </summary>
public sealed class PlayIntegrityVerifier(
    IConfiguration configuration,
    ILogger<PlayIntegrityVerifier> logger) : IDeviceIntegrityVerifier
{
    private readonly string? _serviceAccountJson =
        configuration["DeviceIntegrity:PlayIntegrity:ServiceAccountJson"];
    private readonly string? _packageName =
        configuration["DeviceIntegrity:PlayIntegrity:PackageName"];

    /// <inheritdoc />
    public Task<DeviceIntegrityResult> VerifyAsync(
        string token,
        string platform,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_serviceAccountJson) || string.IsNullOrWhiteSpace(_packageName))
        {
            logger.LogWarning(
                "[PlayIntegrityVerifier] Credentials not configured " +
                "(DeviceIntegrity:PlayIntegrity:ServiceAccountJson / PackageName). " +
                "Returning NotConfigured verdict — configure secrets via GCP Secret Manager for production.");
            return Task.FromResult(new DeviceIntegrityResult(
                DeviceIntegrityVerdict.NotConfigured,
                "Play Integrity credentials not configured."));
        }

        // TODO: implement via Google.Apis.PlayIntegrity.v1 NuGet package when credentials available.
        // Steps:
        //   1. Build GoogleCredential from _serviceAccountJson with PlayIntegrity.v1 scope.
        //   2. Call PlayIntegrityService.V1.DecodeIntegrityToken (POST with token + packageName).
        //   3. Map verdict: MEETS_DEVICE_INTEGRITY → Pass; anything else → Fail.
        //   4. Handle QuotaExceeded / Forbidden gracefully → NotConfigured (don't crash).
        logger.LogWarning(
            "[PlayIntegrityVerifier] STUB — Play Integrity API call not yet implemented. " +
            "Platform={Platform}. Returning NotConfigured until production credentials wired.",
            platform);

        return Task.FromResult(new DeviceIntegrityResult(
            DeviceIntegrityVerdict.NotConfigured,
            "Play Integrity stub: API call not implemented."));
    }
}
