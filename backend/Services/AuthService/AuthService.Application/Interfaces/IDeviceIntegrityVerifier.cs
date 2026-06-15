using SnapAccount.Shared.Domain;

namespace AuthService.Application.Interfaces;

/// <summary>
/// Verdict returned by a device integrity verifier.
/// </summary>
public enum DeviceIntegrityVerdict
{
    /// <summary>Token verified and device is a genuine, non-tampered device.</summary>
    Pass,

    /// <summary>Token verified but device is flagged (emulator, rooted, tampered build).</summary>
    Fail,

    /// <summary>No integrity token was supplied — endpoint policy determines whether to allow.</summary>
    Skipped,

    /// <summary>
    /// Provider credentials are absent; attestation cannot be performed.
    /// Treated identically to <see cref="Skipped"/> unless <c>DeviceIntegrity:Enforce=true</c>.
    /// </summary>
    NotConfigured,
}

/// <summary>
/// Result of a device integrity check, carrying the verdict and an optional reason string.
/// </summary>
/// <param name="Verdict">The attestation outcome.</param>
/// <param name="Reason">Human-readable detail (logged; never returned to the caller).</param>
public record DeviceIntegrityResult(DeviceIntegrityVerdict Verdict, string? Reason = null);

/// <summary>
/// Abstraction over Play Integrity (Android) / App Attest (iOS) attestation.
/// Implementations:
/// <list type="bullet">
///   <item><see cref="MockDeviceIntegrityVerifier"/> — default in local dev / tests.</item>
///   <item>PlayIntegrityVerifier — stubbed; wired when DeviceIntegrity:Provider=play_integrity.</item>
///   <item>AppAttestVerifier — stubbed; wired when DeviceIntegrity:Provider=app_attest.</item>
/// </list>
/// Selection is controlled by <c>DeviceIntegrity:Provider</c> configuration key.
/// </summary>
public interface IDeviceIntegrityVerifier
{
    /// <summary>
    /// Verifies a device integrity token sent in the <c>X-Device-Integrity</c> header.
    /// </summary>
    /// <param name="token">The raw attestation token from the device SDK.</param>
    /// <param name="platform">ANDROID or IOS (from <c>X-Device-Integrity-Platform</c> header).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A <see cref="DeviceIntegrityResult"/> with verdict and optional reason.</returns>
    Task<DeviceIntegrityResult> VerifyAsync(
        string token,
        string platform,
        CancellationToken cancellationToken = default);
}
