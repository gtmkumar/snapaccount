using AuthService.Application.Interfaces;
using OtpNet;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// RFC 6238 TOTP validator backed by the <c>Otp.NET</c> library.
/// Configuration: SHA1, 30-second window, 6 digits, ±1 step tolerance (90 second window)
/// to accommodate clock skew between the server and the user's authenticator app.
/// </summary>
public sealed class OtpNetTotpValidator : ITotpValidator
{
    /// <inheritdoc />
    public bool Verify(string base32Secret, string code)
    {
        try
        {
            var secretBytes = Base32Encoding.ToBytes(base32Secret);
            var totp = new Totp(secretBytes, step: 30, mode: OtpHashMode.Sha1, totpSize: 6);

            // VerificationWindow of 1 means check current, previous, and next step (±30 s)
            return totp.VerifyTotp(code, out _, new VerificationWindow(previous: 1, future: 1));
        }
        catch
        {
            return false;
        }
    }
}
