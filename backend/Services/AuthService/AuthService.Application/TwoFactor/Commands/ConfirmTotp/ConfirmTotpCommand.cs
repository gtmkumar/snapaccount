using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.TwoFactor.Commands.ConfirmTotp;

/// <summary>
/// POST /auth/me/2fa/confirm { code } (RequireAuthorization)
/// Verifies the 6-digit TOTP code against the stored (unconfirmed) secret.
/// On success: sets is_enabled=true, generates 8 recovery codes, stores them HASHED.
/// Returns the plaintext recovery codes ONCE — they cannot be retrieved again.
/// </summary>
/// <param name="Code">The 6-digit TOTP code from the authenticator app.</param>
public record ConfirmTotpCommand(string Code) : ICommand<ConfirmTotpResponse>;

/// <summary>
/// One-time response containing plaintext recovery codes.
/// Store them securely — they will not be shown again.
/// </summary>
/// <param name="RecoveryCodes">8 one-time-use recovery codes, each 12 hex characters.</param>
public record ConfirmTotpResponse(IReadOnlyList<string> RecoveryCodes);

public sealed class ConfirmTotpCommandValidator : AbstractValidator<ConfirmTotpCommand>
{
    public ConfirmTotpCommandValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty()
            .Matches(@"^\d{6}$")
            .WithMessage("TOTP code must be exactly 6 digits.");
    }
}

public sealed class ConfirmTotpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IEncryptionService encryption,
    ITotpValidator totpValidator)
    : ICommandHandler<ConfirmTotpCommand, ConfirmTotpResponse>
{
    private const int RecoveryCodeCount = 8;

    public async Task<Result<ConfirmTotpResponse>> Handle(
        ConfirmTotpCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var totp = await db.UserTotps
            .FirstOrDefaultAsync(t => t.UserId == userId && t.DeletedAt == null, cancellationToken);

        if (totp is null)
            return Error.NotFound("Totp.NotEnrolled",
                "2FA enrollment not found. Call POST /auth/me/2fa/enroll first.");

        if (totp.IsEnabled)
            return Error.Conflict("Totp.AlreadyConfirmed", "2FA is already confirmed and enabled.");

        // Decrypt and verify the code
        var base32Secret = encryption.Decrypt(totp.SecretEncrypted);
        if (!totpValidator.Verify(base32Secret, request.Code))
            return Error.Validation("Totp.InvalidCode", "The TOTP code is invalid or has expired.");

        // Generate 8 recovery codes: random 6-byte hex strings → displayed as "XXXXXX-XXXXXX"
        var plainCodes = Enumerable.Range(0, RecoveryCodeCount)
            .Select(_ =>
            {
                var bytes = RandomNumberGenerator.GetBytes(6);
                var hex = Convert.ToHexString(bytes).ToUpperInvariant();
                return $"{hex[..6]}-{hex[6..]}";
            })
            .ToList();

        // Store SHA-256 hashes
        var hashes = plainCodes
            .Select(c => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(c))).ToLowerInvariant())
            .ToList();

        totp.IsEnabled = true;
        totp.ConfirmedAt = DateTime.UtcNow;
        totp.RecoveryCodes = JsonSerializer.Serialize(hashes);

        await db.SaveChangesAsync(cancellationToken);

        return new ConfirmTotpResponse(plainCodes.AsReadOnly());
    }
}
