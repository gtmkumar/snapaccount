using Microsoft.Extensions.Configuration;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// Resolves the HMAC-SHA256 signing secret for SnapAccount session JWTs.
///
/// The SAME secret must be used by the issuer (AuthService) and every validator (the shared
/// <see cref="FirebaseAuthMiddleware"/> in all 12 services), so this is the single source of truth.
///
/// Resolution order (first non-empty wins):
/// <list type="number">
///   <item><c>Auth:SessionSecret</c> (config) / <c>SESSION_JWT_SECRET</c> (env) — production secret
///         from GCP Secret Manager.</item>
///   <item><c>LOCAL_AUTH:SECRET</c> (config) / <c>LOCAL_AUTH__SECRET</c> (env) — shared dev secret.</item>
///   <item><see cref="FirebaseAuthMiddleware.DefaultLocalSecret"/> — insecure dev fallback.</item>
/// </list>
///
/// Production MUST set <c>SESSION_JWT_SECRET</c> (≥32 chars) so tokens are not signed with the
/// well-known dev default.
/// </summary>
public static class SessionTokenSecret
{
    public static string Resolve(IConfiguration configuration) =>
        Trim(configuration["Auth:SessionSecret"])
        ?? Trim(Environment.GetEnvironmentVariable("SESSION_JWT_SECRET"))
        ?? Trim(configuration["LOCAL_AUTH:SECRET"])
        ?? Trim(Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET"))
        ?? FirebaseAuthMiddleware.DefaultLocalSecret;

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
