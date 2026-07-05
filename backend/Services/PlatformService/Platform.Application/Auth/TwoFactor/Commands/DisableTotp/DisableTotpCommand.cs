using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.TwoFactor.Commands.DisableTotp;

/// <summary>
/// POST /auth/me/2fa/disable { code } (RequireAuthorization)
/// Accepts either a current TOTP code OR a recovery code.
/// On success: soft-disables 2FA (is_enabled = false, clears secret and recovery codes).
/// </summary>
/// <param name="Code">A current 6-digit TOTP code OR a recovery code (format XXXXXX-XXXXXX).</param>
public record DisableTotpCommand(string Code) : ICommand;

public sealed class DisableTotpCommandValidator : AbstractValidator<DisableTotpCommand>
{
    public DisableTotpCommandValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty()
            .WithMessage("A TOTP code or recovery code is required.");
    }
}

public sealed class DisableTotpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IEncryptionService encryption,
    ITotpValidator totpValidator)
    : ICommandHandler<DisableTotpCommand>
{
    public async Task<Result> Handle(
        DisableTotpCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var totp = await db.UserTotps
            .FirstOrDefaultAsync(t => t.UserId == userId && t.DeletedAt == null, cancellationToken);

        if (totp is null || !totp.IsEnabled)
            return Result.Failure(Error.NotFound("Totp.NotEnabled", "2FA is not currently enabled for this account."));

        var base32Secret = encryption.Decrypt(totp.SecretEncrypted);

        // Determine if input is a TOTP code (6 digits) or recovery code (XXXXXX-XXXXXX)
        var isTotpCode = System.Text.RegularExpressions.Regex.IsMatch(request.Code, @"^\d{6}$");
        if (isTotpCode)
        {
            if (!totpValidator.Verify(base32Secret, request.Code))
                return Result.Failure(Error.Validation("Totp.InvalidCode", "The TOTP code is invalid or has expired."));
        }
        else
        {
            // Try recovery code
            if (!ConsumeRecoveryCode(totp, request.Code))
                return Result.Failure(Error.Validation("Totp.InvalidCode", "The code provided is not valid."));
        }

        // Soft-disable: clear secret and recovery codes, mark disabled
        totp.IsEnabled = false;
        totp.ConfirmedAt = null;
        totp.SecretEncrypted = string.Empty;
        totp.RecoveryCodes = null;

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    private static bool ConsumeRecoveryCode(AuthService.Domain.Entities.UserTotp totp, string code)
    {
        if (string.IsNullOrWhiteSpace(totp.RecoveryCodes))
            return false;

        var hashes = JsonSerializer.Deserialize<List<string>>(totp.RecoveryCodes) ?? [];
        var inputHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim()))).ToLowerInvariant();

        var idx = hashes.IndexOf(inputHash);
        if (idx < 0)
        {
            // Also try the code without the dash separator
            var noSep = code.Replace("-", string.Empty);
            inputHash = Convert.ToHexString(
                SHA256.HashData(Encoding.UTF8.GetBytes(noSep.Trim()))).ToLowerInvariant();
            idx = hashes.IndexOf(inputHash);
        }

        if (idx < 0) return false;

        // Mark that recovery code as consumed (remove it)
        hashes.RemoveAt(idx);
        totp.RecoveryCodes = JsonSerializer.Serialize(hashes);
        return true;
    }
}
