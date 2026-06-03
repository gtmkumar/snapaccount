using SnapAccount.Shared.Domain;

namespace AuthService.Application.Interfaces;

/// <summary>
/// Firebase ID token claims extracted during social sign-in verification.
/// All fields map to standard Firebase/Google/Apple JWT claims.
/// </summary>
/// <param name="Uid">Firebase UID (stable across providers for a given Firebase project).</param>
/// <param name="Email">Email address from the identity provider, if provided.</param>
/// <param name="DisplayName">Display name from the identity provider, if provided.</param>
public record FirebaseTokenClaims(string Uid, string? Email, string? DisplayName);

public interface IFirebaseAuthService
{
    Task<Result<string>> VerifyIdTokenAsync(string idToken, CancellationToken ct = default);

    /// <summary>
    /// Verifies the Firebase ID token and returns the full identity claims (uid, email, displayName).
    /// Used by the social sign-in exchange endpoint to find-or-create a user.
    /// </summary>
    Task<Result<FirebaseTokenClaims>> VerifyIdTokenAndGetClaimsAsync(string idToken, CancellationToken ct = default);

    Task<Result<string>> CreateCustomTokenAsync(string uid, IDictionary<string, object>? claims = null, CancellationToken ct = default);
    Task<Result> SetCustomClaimsAsync(string uid, IDictionary<string, object> claims, CancellationToken ct = default);
    Task<Result> RevokeRefreshTokensAsync(string uid, CancellationToken ct = default);
}
