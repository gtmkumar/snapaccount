namespace AuthService.Application.Interfaces;

/// <summary>
/// Sends an OTP via SMS. Distinct from the broader notification fan-out (MSG91 OTP
/// endpoint vs MSG91 Flow endpoint) — OTP delivery uses MSG91's purpose-built OTP
/// API which handles template substitution, retries, and failover SMS routes.
/// </summary>
public interface IOtpSmsSender
{
    /// <summary>
    /// Returns true when the SMS was accepted by the provider, false (with logged
    /// error) when delivery failed. The caller persists OTP regardless so the user
    /// can be told to retry if they didn't receive it.
    /// </summary>
    Task<bool> SendOtpAsync(string phoneNumber, string otp, CancellationToken ct = default);
}
