using System.Security.Cryptography;
using System.Text;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PasswordReset.Commands.ForgotPassword;

/// <summary>
/// POST /auth/password/forgot { email } (Anonymous)
/// ALWAYS returns success (204) regardless of whether the email exists — no user enumeration.
/// When a matching active user is found: generates a 32-byte base64url token, stores the
/// SHA-256 hex hash in auth.password_reset_token (expires 1 hour), and sends a reset email
/// via <see cref="IEmailSender"/>. When no email adapter is configured, the link is logged.
/// </summary>
/// <param name="Email">The email address to send the reset link to.</param>
public record ForgotPasswordCommand(string Email) : ICommand;

public sealed class ForgotPasswordCommandValidator : AbstractValidator<ForgotPasswordCommand>
{
    public ForgotPasswordCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(320)
            .WithMessage("A valid email address is required.");
    }
}

public sealed class ForgotPasswordCommandHandler(
    IAuthDbContext db,
    IEmailSender emailSender,
    IPasswordResetUrlBuilder urlBuilder,
    ILogger<ForgotPasswordCommandHandler> logger)
    : ICommandHandler<ForgotPasswordCommand>
{
    private const int TokenExpiryHours = 1;

    public async Task<Result> Handle(
        ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        // ALWAYS succeed — no user enumeration
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users
            .FirstOrDefaultAsync(
                u => u.Email != null && u.Email.ToLower() == normalizedEmail
                     && u.IsActive && u.DeletedAt == null,
                cancellationToken);

        if (user is not null)
        {
            await CreateAndSendTokenAsync(user, request.Email.Trim(), cancellationToken);
        }

        return Result.Success();
    }

    private async Task CreateAndSendTokenAsync(
        AuthService.Domain.Entities.User user,
        string email,
        CancellationToken ct)
    {
        // Generate a 32-byte cryptographically random token, base64url-encoded
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var tokenPlain = Base64UrlEncode(tokenBytes);

        // Store SHA-256 hex hash — NEVER store plaintext
        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(tokenPlain)))
            .ToLowerInvariant();

        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            ExpiresAt = DateTime.UtcNow.AddHours(TokenExpiryHours)
        });
        await db.SaveChangesAsync(ct);

        var resetLink = urlBuilder.Build(tokenPlain);

        logger.LogInformation("Password reset token created for userId={UserId}.", user.Id);

        await emailSender.SendAsync(
            to: email,
            subject: "SnapAccount — Reset your password",
            bodyText: $"Click the link below to reset your password. It expires in {TokenExpiryHours} hour.\n\n{resetLink}\n\nIf you did not request this, ignore this email.",
            bodyHtml: $"<p>Click the link below to reset your password. It expires in <strong>{TokenExpiryHours} hour</strong>.</p><p><a href=\"{resetLink}\">{resetLink}</a></p><p>If you did not request this, ignore this email.</p>",
            ct: ct);
    }

    private static string Base64UrlEncode(byte[] data)
        => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
