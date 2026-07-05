using System.Security.Cryptography;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Auth.Commands.PasswordAuth;

// =============================================================================
// Phone-number + password auth (no SMS / OTP).
//
// An alternative to the phone-OTP flow that avoids Phone Auth SMS costs entirely.
// Credentials are verified against auth.user.password_hash; a session token is
// issued the same way as OTP verify (Firebase custom token in prod, a locally
// signed LOCAL_AUTH JWT in dev — see FirebaseAuthService.CreateCustomTokenAsync).
// =============================================================================

/// <summary>
/// Shared response for password register/login — mirrors VerifyOtpResponse.
/// When 2FA is active, <see cref="Requires2fa"/> is true and <see cref="ChallengeToken"/> is set;
/// the caller must complete POST /auth/2fa/challenge to obtain the JWT.
/// </summary>
/// <param name="IsNewUser">True when this call created the account (client routes to onboarding).</param>
/// <param name="Token">Bearer session token (Firebase custom token / LOCAL_AUTH JWT). Null when 2FA is required.</param>
/// <param name="UserId">The authenticated user's id.</param>
/// <param name="RefreshToken">
/// Opaque 64-byte base64 refresh token (plaintext). Null when 2FA is required.
/// </param>
/// <param name="RefreshExpiresAt">UTC expiry of the refresh token (30 days from issuance). Null when 2FA required.</param>
/// <param name="Requires2fa">When true, 2FA is enabled — complete the challenge before using the session.</param>
/// <param name="ChallengeToken">Short-lived (5 min) challenge token to pass to POST /auth/2fa/challenge. Set when Requires2fa=true.</param>
public record PasswordAuthResponse(
    bool IsNewUser,
    string? Token,
    Guid UserId,
    string? RefreshToken = null,
    DateTime? RefreshExpiresAt = null,
    bool Requires2fa = false,
    string? ChallengeToken = null);

// ── Register ────────────────────────────────────────────────────────────────

/// <summary>Registers a new user with a phone number + password (no OTP).</summary>
public record RegisterWithPasswordCommand(string PhoneNumber, string Password, string? FullName = null)
    : ICommand<PasswordAuthResponse>;

public sealed class RegisterWithPasswordCommandValidator : AbstractValidator<RegisterWithPasswordCommand>
{
    public RegisterWithPasswordCommandValidator()
    {
        RuleFor(x => x.PhoneNumber)
            .NotEmpty().Matches(@"^[6-9]\d{9}$")
            .WithMessage("Must be a valid Indian mobile number (starts 6-9, 10 digits).");
        RuleFor(x => x.Password)
            .NotEmpty().MinimumLength(8).WithMessage("Password must be at least 8 characters.")
            .MaximumLength(128);
    }
}

public sealed class RegisterWithPasswordCommandHandler(
    IUserRepository userRepository,
    IPasswordHasher passwordHasher,
    IFirebaseAuthService firebaseAuthService,
    IRefreshTokenRepository refreshTokenRepository)
    : ICommandHandler<RegisterWithPasswordCommand, PasswordAuthResponse>
{
    public async Task<Result<PasswordAuthResponse>> Handle(
        RegisterWithPasswordCommand request, CancellationToken cancellationToken)
    {
        var existing = await userRepository.GetByPhoneNumberAsync(request.PhoneNumber, cancellationToken);

        User user;
        bool isNewUser;
        if (existing is null)
        {
            user = new User { PhoneNumber = request.PhoneNumber };
            if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName;
            user.SetPasswordHash(passwordHasher.Hash(request.Password));
            user.AddDomainEvent(new UserRegisteredEvent(user.Id, request.PhoneNumber));
            user = await userRepository.AddAsync(user, cancellationToken);
            isNewUser = true;
        }
        else if (string.IsNullOrEmpty(existing.PasswordHash))
        {
            // Phone already exists (e.g. created via OTP) but has no password — set one.
            existing.SetPasswordHash(passwordHasher.Hash(request.Password));
            if (!string.IsNullOrWhiteSpace(request.FullName) && string.IsNullOrWhiteSpace(existing.FullName))
                existing.FullName = request.FullName;
            user = existing;
            isNewUser = false;
        }
        else
        {
            return Error.Conflict("Auth.AlreadyRegistered",
                "This phone number is already registered. Please log in instead.");
        }

        var firebaseUid = user.FirebaseUid ?? $"phone_{request.PhoneNumber}";
        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            firebaseUid,
            new Dictionary<string, object>
            {
                ["userId"] = user.Id.ToString(),
                ["phoneNumber"] = request.PhoneNumber
            },
            cancellationToken);
        if (tokenResult.IsFailure)
            return tokenResult.Error;

        user.LastLoginAt = DateTime.UtcNow;
        await userRepository.UpdateAsync(user, cancellationToken);

        // Issue initial refresh token — same generation pattern as RefreshTokenCommandHandler.
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenPlain = Convert.ToBase64String(tokenBytes);
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tokenPlain)));

        var refreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            DeviceId = null,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);

        return new PasswordAuthResponse(isNewUser, tokenResult.Value, user.Id, tokenPlain, refreshToken.ExpiresAt);
    }
}

// ── Login ─────────────────────────────────────────────────────────────────

/// <summary>Logs in an existing user with phone number + password (no OTP).</summary>
public record LoginWithPasswordCommand(string PhoneNumber, string Password) : ICommand<PasswordAuthResponse>;

public sealed class LoginWithPasswordCommandValidator : AbstractValidator<LoginWithPasswordCommand>
{
    public LoginWithPasswordCommandValidator()
    {
        RuleFor(x => x.PhoneNumber)
            .NotEmpty().Matches(@"^[6-9]\d{9}$")
            .WithMessage("Must be a valid Indian mobile number.");
        RuleFor(x => x.Password).NotEmpty();
    }
}

public sealed class LoginWithPasswordCommandHandler(
    IUserRepository userRepository,
    IPasswordHasher passwordHasher,
    IFirebaseAuthService firebaseAuthService,
    IRefreshTokenRepository refreshTokenRepository,
    IAuthDbContext db,
    IChallengeTokenService challengeTokenService)
    : ICommandHandler<LoginWithPasswordCommand, PasswordAuthResponse>
{
    public async Task<Result<PasswordAuthResponse>> Handle(
        LoginWithPasswordCommand request, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByPhoneNumberAsync(request.PhoneNumber, cancellationToken);

        // Uniform error — do not reveal whether the phone exists or has a password.
        if (user is null
            || string.IsNullOrEmpty(user.PasswordHash)
            || !passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            return Error.Unauthorized("Auth.InvalidCredentials", "Invalid phone number or password.");
        }

        if (!user.IsActive)
            return Error.Unauthorized("Auth.Inactive", "This account is inactive.");

        // 2FA gate: if TOTP is enabled, return a challenge token instead of the JWT
        var hasTotpEnabled = await db.UserTotps
            .AnyAsync(t => t.UserId == user.Id && t.IsEnabled && t.DeletedAt == null, cancellationToken);
        if (hasTotpEnabled)
        {
            var challengeToken = challengeTokenService.Issue(user.Id);
            return new PasswordAuthResponse(
                IsNewUser: false, Token: null, UserId: user.Id,
                Requires2fa: true, ChallengeToken: challengeToken);
        }

        var firebaseUid = user.FirebaseUid ?? $"phone_{request.PhoneNumber}";
        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            firebaseUid,
            new Dictionary<string, object>
            {
                ["userId"] = user.Id.ToString(),
                ["phoneNumber"] = request.PhoneNumber
            },
            cancellationToken);
        if (tokenResult.IsFailure)
            return tokenResult.Error;

        user.LastLoginAt = DateTime.UtcNow;
        await userRepository.UpdateAsync(user, cancellationToken);

        // Issue initial refresh token — same generation pattern as RefreshTokenCommandHandler.
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenPlain = Convert.ToBase64String(tokenBytes);
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tokenPlain)));

        var refreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            DeviceId = null,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);

        return new PasswordAuthResponse(IsNewUser: false, tokenResult.Value, user.Id, tokenPlain, refreshToken.ExpiresAt);
    }
}
