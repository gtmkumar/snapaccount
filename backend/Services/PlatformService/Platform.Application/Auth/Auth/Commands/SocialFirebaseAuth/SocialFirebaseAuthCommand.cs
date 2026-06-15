using System.Security.Cryptography;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Auth.Commands.SocialFirebaseAuth;

// =============================================================================
// POST /auth/social/firebase — Google / Apple social sign-in exchange.
//
// The mobile app completes Firebase social sign-in (Google / Apple), then sends
// the resulting Firebase ID token here. This endpoint verifies it, find-or-creates
// the user, issues the same token shape as OTP-verify / password-login, and
// handles the 2FA gate identically to LoginWithPasswordCommand.
//
// DEV_AUTH_BYPASS=true: Firebase verification is skipped; the provided email and
// displayName are trusted directly (local stub path — NEVER in production).
// Follows the same env-var pattern as CreateUserAdminCommand.
// =============================================================================

/// <summary>
/// Social (Google / Apple) Firebase sign-in exchange command.
/// </summary>
/// <param name="FirebaseIdToken">
/// Firebase ID token obtained after Google/Apple sign-in in the mobile app.
/// Required field; content is ignored under DEV_AUTH_BYPASS.
/// </param>
/// <param name="Provider">Identity provider — <c>"google"</c> or <c>"apple"</c>.</param>
/// <param name="Email">
/// Email hint from the client. Used as-is under DEV_AUTH_BYPASS; in production
/// the server-verified email from the Firebase token takes precedence.
/// </param>
/// <param name="DisplayName">Display name hint (optional). Used when creating a new user.</param>
public record SocialFirebaseAuthCommand(
    string FirebaseIdToken,
    string Provider,
    string? Email = null,
    string? DisplayName = null)
    : ICommand<SocialFirebaseAuthResponse>;

/// <summary>
/// Response for a successful social sign-in exchange.
/// Shape mirrors <see cref="AuthService.Application.Auth.Commands.PasswordAuth.PasswordAuthResponse"/>.
/// </summary>
/// <param name="IsNewUser">True when this call created a new SnapAccount user (route to onboarding).</param>
/// <param name="Token">Bearer session token. Null when 2FA is required.</param>
/// <param name="UserId">The authenticated user's id.</param>
/// <param name="RefreshToken">
/// Opaque 64-byte base64 refresh token (plaintext — store in Expo SecureStore).
/// Null when 2FA is required.
/// </param>
/// <param name="RefreshExpiresAt">UTC expiry of the refresh token (30 days). Null when 2FA required.</param>
/// <param name="Requires2fa">When true the user has 2FA enabled; complete POST /auth/2fa/challenge.</param>
/// <param name="ChallengeToken">Short-lived 5-minute challenge token. Set only when Requires2fa=true.</param>
public record SocialFirebaseAuthResponse(
    bool IsNewUser,
    string? Token,
    Guid UserId,
    string? RefreshToken = null,
    DateTime? RefreshExpiresAt = null,
    bool Requires2fa = false,
    string? ChallengeToken = null);

/// <summary>
/// FluentValidation validator for <see cref="SocialFirebaseAuthCommand"/>.
/// Under DEV_AUTH_BYPASS, the email field is required because there is no
/// Firebase token to extract it from.
/// Reads DEV_AUTH_BYPASS from the environment variable directly (same pattern
/// as <c>CreateUserAdminCommand</c> which reads LOCAL_AUTH via env var).
/// </summary>
public sealed class SocialFirebaseAuthCommandValidator : AbstractValidator<SocialFirebaseAuthCommand>
{
    private static readonly HashSet<string> ValidProviders =
        new(StringComparer.OrdinalIgnoreCase) { "google", "apple" };

    /// <summary>
    /// Parameterless constructor — DEV_AUTH_BYPASS read from the process environment.
    /// Used by MediatR DI registration.
    /// </summary>
    public SocialFirebaseAuthCommandValidator() : this(IsDevBypassActive()) { }

    /// <summary>
    /// Constructor with explicit bypass flag — used in unit tests for deterministic behaviour.
    /// </summary>
    public SocialFirebaseAuthCommandValidator(bool devBypass)
    {
        RuleFor(x => x.FirebaseIdToken)
            .NotEmpty()
            .WithMessage("firebaseIdToken is required.");

        RuleFor(x => x.Provider)
            .NotEmpty()
            .Must(p => ValidProviders.Contains(p))
            .WithMessage("provider must be 'google' or 'apple'.");

        // Under DEV_AUTH_BYPASS there is no Firebase token to extract email from, so
        // the caller must supply one to drive find-or-create.
        if (devBypass)
        {
            RuleFor(x => x.Email)
                .NotEmpty()
                .WithMessage("email is required when DEV_AUTH_BYPASS is active.");
        }
    }

    internal static bool IsDevBypassActive() =>
        string.Equals(
            Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS"), "true",
            StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Verifies the Firebase ID token (or trusts the stub under DEV_AUTH_BYPASS),
/// finds or creates the SnapAccount <see cref="User"/> by Firebase UID / email,
/// issues a Firebase custom token, and persists a refresh token — identical to
/// the OTP-verify and password-login flows.
/// Also checks TOTP 2FA and returns a challenge token when needed.
/// </summary>
public sealed class SocialFirebaseAuthCommandHandler(
    IFirebaseAuthService firebaseAuthService,
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    IAuthDbContext db,
    IChallengeTokenService challengeTokenService)
    : ICommandHandler<SocialFirebaseAuthCommand, SocialFirebaseAuthResponse>
{
    // Reads the same env var as FirebaseAuthService / CreateUserAdminCommand.
    private static bool DevBypassEnabled =>
        string.Equals(
            Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS"), "true",
            StringComparison.OrdinalIgnoreCase);

    /// <inheritdoc />
    public async Task<Result<SocialFirebaseAuthResponse>> Handle(
        SocialFirebaseAuthCommand request,
        CancellationToken cancellationToken)
    {
        // ── Step 1: Resolve Firebase UID + identity claims ──────────────────────

        string firebaseUid;
        string? resolvedEmail;
        string? resolvedName;

        if (DevBypassEnabled)
        {
            // Local stub: trust what the client sends — Firebase is not configured.
            // The firebaseIdToken field is still required by the validator so the
            // endpoint signature is consistent; we just ignore its contents here.
            firebaseUid = $"dev_{request.Provider}_{request.Email}";
            resolvedEmail = request.Email;
            resolvedName = request.DisplayName;
        }
        else
        {
            var claimsResult = await firebaseAuthService.VerifyIdTokenAndGetClaimsAsync(
                request.FirebaseIdToken, cancellationToken);

            if (claimsResult.IsFailure)
                return claimsResult.Error;

            firebaseUid = claimsResult.Value.Uid;
            // Server-verified email supersedes any client-provided hint.
            resolvedEmail = claimsResult.Value.Email ?? request.Email;
            resolvedName = claimsResult.Value.DisplayName ?? request.DisplayName;
        }

        // ── Step 2: Find or create the User aggregate ────────────────────────────
        // Lookup order: Firebase UID first (most stable), then email as fallback.

        var user = await userRepository.GetByFirebaseUidAsync(firebaseUid, cancellationToken);

        if (user is null && !string.IsNullOrWhiteSpace(resolvedEmail))
            user = await userRepository.GetByEmailAsync(resolvedEmail, cancellationToken);

        var isNewUser = user is null;

        if (isNewUser)
        {
            user = new User
            {
                Email = resolvedEmail,
                FullName = resolvedName
            };

            // Link the Firebase UID and mark email as verified (Google/Apple have already verified it).
            user.LinkFirebaseUid(firebaseUid);

            user.AddDomainEvent(new UserRegisteredEvent(user.Id, resolvedEmail ?? firebaseUid));
            user = await userRepository.AddAsync(user, cancellationToken);
        }
        else
        {
            // Existing user: link Firebase UID if not already set (e.g. user created via OTP).
            if (string.IsNullOrEmpty(user!.FirebaseUid))
                user.LinkFirebaseUid(firebaseUid);

            // Backfill email / name from the social provider if missing.
            if (string.IsNullOrEmpty(user.Email) && !string.IsNullOrWhiteSpace(resolvedEmail))
                user.Email = resolvedEmail;

            if (string.IsNullOrEmpty(user.FullName) && !string.IsNullOrWhiteSpace(resolvedName))
                user.FullName = resolvedName;
        }

        // ── Step 3: 2FA gate ─────────────────────────────────────────────────────
        var hasTotpEnabled = await db.UserTotps
            .AnyAsync(
                t => t.UserId == user.Id && t.IsEnabled && t.DeletedAt == null,
                cancellationToken);

        if (hasTotpEnabled)
        {
            var challengeToken = challengeTokenService.Issue(user.Id);
            return new SocialFirebaseAuthResponse(
                IsNewUser: isNewUser,
                Token: null,
                UserId: user.Id,
                Requires2fa: true,
                ChallengeToken: challengeToken);
        }

        // ── Step 4: Issue Firebase custom token (or LOCAL_AUTH JWT in dev) ───────
        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            firebaseUid,
            new Dictionary<string, object>
            {
                ["userId"] = user.Id.ToString(),
                ["email"] = resolvedEmail ?? string.Empty
            },
            cancellationToken);

        if (tokenResult.IsFailure)
            return tokenResult.Error;

        user.LastLoginAt = DateTime.UtcNow;
        await userRepository.UpdateAsync(user, cancellationToken);

        // ── Step 5: Issue initial refresh token ───────────────────────────────────
        // 64 random bytes → base64 plaintext returned to caller; SHA-256 hex stored in DB.
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenPlain = Convert.ToBase64String(tokenBytes);
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tokenPlain)));

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            DeviceId = null,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);

        return new SocialFirebaseAuthResponse(
            isNewUser,
            tokenResult.Value,
            user.Id,
            tokenPlain,
            refreshToken.ExpiresAt);
    }
}
