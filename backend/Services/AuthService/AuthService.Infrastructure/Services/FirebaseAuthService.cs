using AuthService.Application.Interfaces;
using FirebaseAdmin.Auth;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Auth;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Firebase Auth service using FirebaseAdmin SDK.
/// NOT Microsoft.Identity.Web.
/// </summary>
public sealed class FirebaseAuthService(
    ILogger<FirebaseAuthService> logger,
    IConfiguration configuration) : IFirebaseAuthService
{
    // LOCAL_AUTH / DEV_AUTH_BYPASS dev mode: Firebase is not configured locally, so
    // CreateCustomTokenAsync mints a locally-signed HS256 JWT (the same kind LOCAL_AUTH
    // login issues) that the shared FirebaseAuthMiddleware accepts across all services.
    // This lets the mobile phone-OTP flow work end-to-end without Firebase. NEVER in prod.
    private static readonly TimeSpan DevTokenLifetime = TimeSpan.FromHours(12);

    private bool DevAuthEnabled =>
        string.Equals(configuration["LOCAL_AUTH"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("LOCAL_AUTH"), "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(configuration["DEV_AUTH_BYPASS"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS"), "true", StringComparison.OrdinalIgnoreCase);

    private string LocalAuthSecret =>
        configuration["LOCAL_AUTH:SECRET"]
        ?? Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET")
        ?? FirebaseAuthMiddleware.DefaultLocalSecret;
    public async Task<Result<string>> VerifyIdTokenAsync(string idToken, CancellationToken ct = default)
    {
        try
        {
            var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken, ct);
            return decodedToken.Uid;
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogWarning("Firebase token verification failed: {Message}", ex.Message);
            return Error.Unauthorized("Firebase.TokenInvalid", "The provided Firebase ID token is invalid or expired.");
        }
    }

    /// <inheritdoc />
    public async Task<Result<FirebaseTokenClaims>> VerifyIdTokenAndGetClaimsAsync(
        string idToken,
        CancellationToken ct = default)
    {
        try
        {
            var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken, ct);

            var email = decodedToken.Claims.TryGetValue("email", out var emailObj)
                ? emailObj?.ToString()
                : null;

            var name = decodedToken.Claims.TryGetValue("name", out var nameObj)
                ? nameObj?.ToString()
                : null;

            return new FirebaseTokenClaims(decodedToken.Uid, email, name);
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogWarning("Firebase token verification failed during social sign-in: {Message}", ex.Message);
            return Error.Unauthorized("Firebase.TokenInvalid", "The provided Firebase ID token is invalid or expired.");
        }
    }

    public async Task<Result<string>> CreateCustomTokenAsync(
        string uid,
        IDictionary<string, object>? claims = null,
        CancellationToken ct = default)
    {
        // ── Local dev: mint a LOCAL_AUTH HS256 JWT instead of a Firebase custom token ──
        // Firebase Admin is not initialised without GCP creds, so the real path would throw.
        // The token carries the caller's userId so ICurrentUser resolves the freshly
        // registered phone-OTP user across AuthService + DocumentService + …
        if (DevAuthEnabled)
        {
            var userId = claims is not null && claims.TryGetValue("userId", out var uidVal)
                ? uidVal?.ToString()
                : null;
            var phone = claims is not null && claims.TryGetValue("phoneNumber", out var phoneVal)
                ? phoneVal?.ToString()
                : null;

            var jwtClaims = new Dictionary<string, object?>
            {
                ["userId"]         = userId,
                // No org yet at signup time; empty GUID satisfies handlers that require a
                // non-null OrganizationId (e.g. document OCR) without scoping to a real org.
                ["organizationId"] = Guid.Empty.ToString(),
                ["roles"]          = new[] { "BUSINESS_OWNER" },
                // Dev-only wildcard so the mobile customer can exercise document/GST/loan
                // flows without modelling the full BUSINESS_OWNER permission set locally.
                ["permissions"]    = new[] { "*" },
                ["phone_number"]   = phone,
                ["firebase_uid"]   = uid,
            };

            logger.LogWarning(
                "LOCAL_AUTH/DEV_AUTH_BYPASS: issuing a local HS256 token for uid {Uid} (NEVER in production).",
                uid);
            return LocalJwt.Issue(jwtClaims, LocalAuthSecret, DevTokenLifetime);
        }

        try
        {
            var token = await FirebaseAuth.DefaultInstance.CreateCustomTokenAsync(uid, claims, ct);
            return token;
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogError(ex, "Failed to create custom token for uid {Uid}", uid);
            return Error.Validation("Firebase.CustomTokenFailed", "Failed to create authentication token.");
        }
    }

    public async Task<Result> SetCustomClaimsAsync(
        string uid,
        IDictionary<string, object> claims,
        CancellationToken ct = default)
    {
        try
        {
            var readonlyClaims = claims.ToDictionary(k => k.Key, v => v.Value) as IReadOnlyDictionary<string, object>;
            await FirebaseAuth.DefaultInstance.SetCustomUserClaimsAsync(uid, readonlyClaims!, ct);
            return Result.Success();
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogError(ex, "Failed to set custom claims for uid {Uid}", uid);
            return Result.Failure(Error.Validation("Firebase.ClaimsFailed", "Failed to set user claims."));
        }
    }

    public async Task<Result> RevokeRefreshTokensAsync(string uid, CancellationToken ct = default)
    {
        try
        {
            await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid, ct);
            return Result.Success();
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogError(ex, "Failed to revoke refresh tokens for uid {Uid}", uid);
            return Result.Failure(Error.Validation("Firebase.RevokeFailed", "Failed to revoke Firebase tokens."));
        }
    }
}
