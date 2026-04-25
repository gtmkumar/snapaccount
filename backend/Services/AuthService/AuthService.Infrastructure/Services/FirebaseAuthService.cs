using AuthService.Application.Interfaces;
using FirebaseAdmin.Auth;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Firebase Auth service using FirebaseAdmin SDK.
/// NOT Microsoft.Identity.Web.
/// </summary>
public sealed class FirebaseAuthService(ILogger<FirebaseAuthService> logger) : IFirebaseAuthService
{
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

    public async Task<Result<string>> CreateCustomTokenAsync(
        string uid,
        IDictionary<string, object>? claims = null,
        CancellationToken ct = default)
    {
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
