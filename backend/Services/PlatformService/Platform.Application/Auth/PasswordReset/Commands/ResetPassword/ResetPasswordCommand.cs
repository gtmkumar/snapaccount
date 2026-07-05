using System.Security.Cryptography;
using System.Text;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PasswordReset.Commands.ResetPassword;

/// <summary>
/// POST /auth/password/reset { token, newPassword } (Anonymous)
/// Hashes the token, finds an unused + unexpired auth.password_reset_token.
/// On success: updates the user's password hash, marks the token as used,
/// revokes ALL existing refresh tokens for the user.
/// Returns 204 on success, 400 on invalid/expired/used token.
/// </summary>
/// <param name="Token">The plaintext token from the reset link.</param>
/// <param name="NewPassword">The new password (min 8 chars, max 128).</param>
public record ResetPasswordCommand(string Token, string NewPassword) : ICommand;

public sealed class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.Token)
            .NotEmpty().WithMessage("Reset token is required.");

        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.")
            .MaximumLength(128).WithMessage("Password must be at most 128 characters.");
    }
}

public sealed class ResetPasswordCommandHandler(
    IAuthDbContext db,
    IPasswordHasher passwordHasher,
    IRefreshTokenRepository refreshTokenRepository)
    : ICommandHandler<ResetPasswordCommand>
{
    public async Task<Result> Handle(
        ResetPasswordCommand request, CancellationToken cancellationToken)
    {
        // Hash the provided token to look it up (never store plaintext)
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(request.Token.Trim())))
            .ToLowerInvariant();

        var resetToken = await db.PasswordResetTokens
            .FirstOrDefaultAsync(
                r => r.TokenHash == tokenHash && r.DeletedAt == null,
                cancellationToken);

        if (resetToken is null || !resetToken.IsValid)
            return Result.Failure(Error.Validation("PasswordReset.InvalidToken",
                "The reset link is invalid, expired, or has already been used."));

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Id == resetToken.UserId && u.IsActive && u.DeletedAt == null, cancellationToken);

        if (user is null)
            return Result.Failure(Error.Validation("PasswordReset.InvalidToken", "The reset link is invalid."));

        // Update password
        user.SetPasswordHash(passwordHasher.Hash(request.NewPassword));

        // Mark token as used
        resetToken.UsedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        // Revoke all existing refresh tokens to force re-login
        await refreshTokenRepository.RevokeAllForUserAsync(
            user.Id, "Password reset", cancellationToken);

        return Result.Success();
    }
}
