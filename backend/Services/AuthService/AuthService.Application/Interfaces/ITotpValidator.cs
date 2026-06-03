namespace AuthService.Application.Interfaces;

/// <summary>
/// Verifies TOTP codes (RFC 6238 — SHA1, 30 second window, 6 digits).
/// Concrete implementation in Infrastructure uses Otp.NET.
/// Abstracted for testability — unit tests can stub validation without the Otp.NET dependency.
/// A ±1 window (90 seconds tolerance) is applied to accommodate clock skew.
/// </summary>
public interface ITotpValidator
{
    /// <summary>
    /// Validates <paramref name="code"/> against the base32-encoded <paramref name="secret"/>.
    /// Also accepts recovery codes when validated separately by handlers (not via this interface).
    /// </summary>
    /// <param name="base32Secret">The unencrypted base32 TOTP secret.</param>
    /// <param name="code">The 6-digit code from the authenticator app.</param>
    /// <returns>True when the code is valid within the allowed window.</returns>
    bool Verify(string base32Secret, string code);
}
