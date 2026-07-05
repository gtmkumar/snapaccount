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
///   <item><see cref="FirebaseAuthMiddleware.DefaultLocalSecret"/> — insecure dev fallback (Dev only).</item>
/// </list>
///
/// Production MUST set <c>SESSION_JWT_SECRET</c> (≥32 chars) so tokens are not signed with the
/// well-known dev default.  Call <see cref="ValidateOrThrow"/> from each service's <c>Program.cs</c>
/// before <c>app.Run()</c> to enforce this at startup in non-Development environments.
/// </summary>
public static class SessionTokenSecret
{
    /// <summary>
    /// Resolves the session JWT signing secret using the priority order documented above.
    /// Never returns null — falls back to <see cref="FirebaseAuthMiddleware.DefaultLocalSecret"/> if nothing is configured.
    /// </summary>
    public static string Resolve(IConfiguration configuration) =>
        Trim(configuration["Auth:SessionSecret"])
        ?? Trim(Environment.GetEnvironmentVariable("SESSION_JWT_SECRET"))
        ?? Trim(configuration["LOCAL_AUTH:SECRET"])
        ?? Trim(Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET"))
        ?? FirebaseAuthMiddleware.DefaultLocalSecret;

    /// <summary>
    /// GAP-005: Enforces that a production-grade secret is configured in non-Development environments.
    ///
    /// Throws <see cref="InvalidOperationException"/> at startup when:
    /// <list type="bullet">
    ///   <item>The environment is NOT <c>Development</c>, AND</item>
    ///   <item>No secret is configured — the resolved value would be <see cref="FirebaseAuthMiddleware.DefaultLocalSecret"/>
    ///         (the well-known hardcoded fallback committed to the repository).</item>
    /// </list>
    ///
    /// Development is intentionally unaffected so local dev tooling continues to work without secrets.
    ///
    /// Call this from every service's <c>Program.cs</c> before <c>app.Run()</c>:
    /// <code>
    /// SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);
    /// </code>
    /// </summary>
    /// <param name="configuration">Resolved application configuration.</param>
    /// <param name="environmentName">
    /// Value of <c>IHostEnvironment.EnvironmentName</c> (e.g. "Development", "Production", "Staging").
    /// Only <c>"Development"</c> bypasses the check.
    /// </param>
    /// <exception cref="InvalidOperationException">
    /// Thrown in non-Development when <c>SESSION_JWT_SECRET</c> (or any other production secret slot)
    /// is absent, forcing the service to refuse to start rather than silently accepting tokens
    /// signed with the public default key.
    /// </exception>
    public static void ValidateOrThrow(IConfiguration configuration, string environmentName)
    {
        // Development and Testing are non-deployed, developer/CI-only environments.
        // Integration tests run under the conventional "Testing" environment and never
        // provision production secrets, so they are exempt exactly like Development.
        // Only real deployment targets (Staging, Production, ...) are enforced.
        if (string.Equals(environmentName, "Development", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(environmentName, "Testing", StringComparison.OrdinalIgnoreCase))
            return;

        var resolved = Resolve(configuration);

        if (string.Equals(resolved, FirebaseAuthMiddleware.DefaultLocalSecret, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "SESSION_JWT_SECRET is not configured. " +
                "In non-Development environments, 'Auth:SessionSecret' (config) or 'SESSION_JWT_SECRET' (env) " +
                "MUST be set to a secret provisioned in GCP Secret Manager. " +
                "Starting the service with the well-known default secret would allow any party who reads " +
                "this repository to forge valid session tokens. " +
                "Set SESSION_JWT_SECRET before starting this service in Production or Staging.");
        }
    }

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
