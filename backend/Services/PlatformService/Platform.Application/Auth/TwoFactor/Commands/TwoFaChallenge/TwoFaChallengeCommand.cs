using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.TwoFactor.Commands.TwoFaChallenge;

/// <summary>
/// Full authentication response issued after a successful 2FA challenge.
/// Mirrors <see cref="AuthService.Application.Auth.Commands.PasswordAuth.PasswordAuthResponse"/>.
/// </summary>
/// <param name="Token">Firebase custom token / LOCAL_AUTH JWT.</param>
/// <param name="UserId">Authenticated user's id.</param>
/// <param name="RefreshToken">Opaque refresh token (plaintext — store securely).</param>
/// <param name="RefreshExpiresAt">UTC expiry of the refresh token.</param>
public record TwoFaChallengeResponse(
    string Token,
    Guid UserId,
    string RefreshToken,
    DateTime RefreshExpiresAt);

/// <summary>
/// POST /auth/2fa/challenge { challengeToken, code } (Anonymous)
/// Validates the short-lived challenge token produced by the login handlers when 2FA is enabled,
/// verifies the TOTP/recovery code, then issues the full JWT + refresh token.
/// </summary>
/// <param name="ChallengeToken">The opaque challenge token from the login response.</param>
/// <param name="Code">A 6-digit TOTP code OR a recovery code (XXXXXX-XXXXXX).</param>
public record TwoFaChallengeCommand(string ChallengeToken, string Code) : ICommand<TwoFaChallengeResponse>;

public sealed class TwoFaChallengeCommandValidator : AbstractValidator<TwoFaChallengeCommand>
{
    public TwoFaChallengeCommandValidator()
    {
        RuleFor(x => x.ChallengeToken).NotEmpty().WithMessage("Challenge token is required.");
        RuleFor(x => x.Code).NotEmpty().WithMessage("A TOTP code or recovery code is required.");
    }
}

public sealed class TwoFaChallengeCommandHandler(
    IAuthDbContext db,
    IFirebaseAuthService firebaseAuthService,
    IRefreshTokenRepository refreshTokenRepository,
    IEncryptionService encryption,
    ITotpValidator totpValidator,
    IChallengeTokenService challengeTokenService)
    : ICommandHandler<TwoFaChallengeCommand, TwoFaChallengeResponse>
{
    public async Task<Result<TwoFaChallengeResponse>> Handle(
        TwoFaChallengeCommand request, CancellationToken cancellationToken)
    {
        // 1. Validate + decode challenge token
        var userId = challengeTokenService.Validate(request.ChallengeToken);
        if (userId is null)
            return Error.Unauthorized("TwoFa.InvalidChallenge",
                "The challenge token is invalid or has expired. Please log in again.");

        // 2. Load user + TOTP record
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Id == userId.Value && u.IsActive, cancellationToken);
        if (user is null)
            return Error.Unauthorized("TwoFa.InvalidChallenge", "User not found or inactive.");

        var totp = await db.UserTotps
            .FirstOrDefaultAsync(t => t.UserId == userId.Value && t.IsEnabled && t.DeletedAt == null, cancellationToken);
        if (totp is null)
            return Error.Unauthorized("TwoFa.NotEnabled", "2FA is not enabled for this account.");

        // 3. Verify TOTP code or recovery code
        var isTotpCode = System.Text.RegularExpressions.Regex.IsMatch(request.Code, @"^\d{6}$");
        if (isTotpCode)
        {
            var base32Secret = encryption.Decrypt(totp.SecretEncrypted);
            if (!totpValidator.Verify(base32Secret, request.Code))
                return Error.Unauthorized("TwoFa.InvalidCode", "Invalid or expired TOTP code.");
        }
        else
        {
            if (!ConsumeRecoveryCode(totp, request.Code))
                return Error.Unauthorized("TwoFa.InvalidCode", "Invalid recovery code.");
        }

        // 4. Issue Firebase custom token (same path as password login)
        var firebaseUid = user.FirebaseUid ?? $"phone_{user.PhoneNumber}";
        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            firebaseUid,
            new Dictionary<string, object>
            {
                ["userId"] = user.Id.ToString(),
                ["phoneNumber"] = user.PhoneNumber ?? string.Empty
            },
            cancellationToken);
        if (tokenResult.IsFailure)
            return tokenResult.Error;

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        // 5. Issue refresh token
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenPlain = Convert.ToBase64String(tokenBytes);
        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(tokenPlain)));

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            DeviceId = null,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);

        return new TwoFaChallengeResponse(tokenResult.Value, user.Id, tokenPlain, refreshToken.ExpiresAt);
    }

    private static bool ConsumeRecoveryCode(UserTotp totp, string code)
    {
        if (string.IsNullOrWhiteSpace(totp.RecoveryCodes))
            return false;

        var hashes = JsonSerializer.Deserialize<List<string>>(totp.RecoveryCodes) ?? [];
        var inputHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim()))).ToLowerInvariant();

        var idx = hashes.IndexOf(inputHash);
        if (idx < 0) return false;

        hashes.RemoveAt(idx);
        totp.RecoveryCodes = JsonSerializer.Serialize(hashes);
        return true;
    }
}
