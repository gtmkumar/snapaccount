using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.TwoFactor.Commands.EnrollTotp;

/// <summary>Response returned after enrolling TOTP 2FA.</summary>
/// <param name="OtpauthUri">
/// RFC 6238 otpauth:// URI — scan with Google Authenticator / Authy.
/// Format: <c>otpauth://totp/SnapAccount:{account}?secret={base32}&amp;issuer=SnapAccount&amp;algorithm=SHA1&amp;digits=6&amp;period=30</c>
/// </param>
/// <param name="Base32Secret">The raw base32-encoded TOTP secret shown once for manual entry.</param>
public record EnrollTotpResponse(string OtpauthUri, string Base32Secret);

/// <summary>
/// POST /auth/me/2fa/enroll (RequireAuthorization)
/// Generates a fresh TOTP secret (SHA1, 30 s, 6 digits), stores it encrypted + unconfirmed
/// in auth.user_totp (is_enabled = false). If a previous UNCONFIRMED enrollment exists it is
/// overwritten — allows retries. If 2FA is already confirmed/enabled, returns 409.
/// </summary>
public record EnrollTotpCommand : ICommand<EnrollTotpResponse>;

public sealed class EnrollTotpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IEncryptionService encryption)
    : ICommandHandler<EnrollTotpCommand, EnrollTotpResponse>
{
    public async Task<Result<EnrollTotpResponse>> Handle(
        EnrollTotpCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Guard: if already confirmed/enabled, reject
        var existing = await db.UserTotps
            .FirstOrDefaultAsync(t => t.UserId == userId && t.DeletedAt == null, cancellationToken);

        if (existing is { IsEnabled: true })
            return Error.Conflict("Totp.AlreadyEnabled",
                "2FA is already enabled for this account. Disable it first before re-enrolling.");

        // Generate a random 20-byte (160-bit) TOTP secret (matches Google Authenticator defaults)
        var secretBytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(20);
        var base32Secret = Base32Encode(secretBytes);

        // Encrypt before storage
        var encryptedSecret = encryption.Encrypt(base32Secret);

        // Resolve account label (email or phone)
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
            return Error.NotFound("User.NotFound", "Authenticated user not found.");

        var account = user.Email ?? user.PhoneNumber ?? userId.ToString();
        var uri = BuildOtpauthUri(account, base32Secret);

        if (existing is not null)
        {
            // Overwrite unconfirmed enrollment (retry)
            existing.SecretEncrypted = encryptedSecret;
            existing.IsEnabled = false;
            existing.ConfirmedAt = null;
            existing.RecoveryCodes = null;
        }
        else
        {
            db.UserTotps.Add(new UserTotp
            {
                UserId = userId,
                SecretEncrypted = encryptedSecret,
                IsEnabled = false
            });
        }

        await db.SaveChangesAsync(cancellationToken);

        return new EnrollTotpResponse(uri, base32Secret);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private static string BuildOtpauthUri(string account, string base32Secret)
    {
        var issuer = "SnapAccount";
        var encodedAccount = Uri.EscapeDataString($"{issuer}:{account}");
        return $"otpauth://totp/{encodedAccount}?secret={base32Secret}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits=6&period=30";
    }

    /// <summary>
    /// RFC 4648 Base32 encoding (no padding) — compatible with Google Authenticator.
    /// Otp.NET accepts standard base32; we generate it here so the secret is readable.
    /// </summary>
    private static string Base32Encode(byte[] data)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var result = new System.Text.StringBuilder((data.Length * 8 + 4) / 5);
        int buffer = 0, bitsLeft = 0;
        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bitsLeft += 8;
            while (bitsLeft >= 5)
            {
                bitsLeft -= 5;
                result.Append(alphabet[(buffer >> bitsLeft) & 31]);
            }
        }
        if (bitsLeft > 0)
            result.Append(alphabet[(buffer << (5 - bitsLeft)) & 31]);
        return result.ToString();
    }
}
