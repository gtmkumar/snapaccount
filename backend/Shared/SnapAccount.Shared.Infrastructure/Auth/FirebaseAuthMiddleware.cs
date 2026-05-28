using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// Validates Firebase ID tokens on each request and populates the current user context.
/// Uses FirebaseAdmin SDK only — NOT Microsoft.Identity.Web.
///
/// Local dev: when DEV_AUTH_BYPASS=true (env var or appsettings:DEV_AUTH_BYPASS=true),
/// canned dev tokens listed in DevAuthTokens map directly to seeded user claims
/// without calling Firebase. NEVER enable in staging or production.
/// </summary>
public sealed class FirebaseAuthMiddleware(
    RequestDelegate next,
    ILogger<FirebaseAuthMiddleware> logger,
    IConfiguration configuration)
{
    private const string AuthorizationHeader = "Authorization";
    private const string BearerPrefix = "Bearer ";

    private static readonly Dictionary<string, IReadOnlyDictionary<string, object>> DevAuthTokens = new(StringComparer.Ordinal)
    {
        // Super Admin
        ["dev-superadmin-token"] = new Dictionary<string, object>
        {
            ["userId"] = "11111111-1111-1111-1111-111111111111",
            ["organizationId"] = "00000000-0000-0000-0000-000000000000",
            ["roles"] = new[] { "SYSTEM_ADMIN", "OPERATIONS_MANAGER" },
            ["phone_number"] = "+919000000001",
            ["email"] = "superadmin@snapaccount.local",
            ["firebase_uid"] = "dev-superadmin-uid",
        },
        // Admin / CA
        ["dev-admin-token"] = new Dictionary<string, object>
        {
            ["userId"] = "22222222-2222-2222-2222-222222222222",
            ["organizationId"] = "00000000-0000-0000-0000-000000000000",
            ["roles"] = new[] { "CA", "OPERATIONS_MANAGER" },
            ["phone_number"] = "+919000000002",
            ["email"] = "admin@snapaccount.local",
            ["firebase_uid"] = "dev-admin-uid",
        },
        // SME owner / regular User
        ["dev-user-token"] = new Dictionary<string, object>
        {
            ["userId"] = "33333333-3333-3333-3333-333333333333",
            ["organizationId"] = "44444444-4444-4444-4444-444444444444",
            ["roles"] = new[] { "BUSINESS_OWNER" },
            ["phone_number"] = "+919000000003",
            ["email"] = "user@snapaccount.local",
            ["firebase_uid"] = "dev-user-uid",
        },
    };

    private bool DevBypassEnabled =>
        string.Equals(configuration["DEV_AUTH_BYPASS"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS"), "true", StringComparison.OrdinalIgnoreCase);

    // LOCAL_AUTH: validate locally-issued HS256 JWTs (username/password dev login) instead
    // of Firebase ID tokens. NEVER enabled in staging/production.
    private bool LocalAuthEnabled =>
        string.Equals(configuration["LOCAL_AUTH"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("LOCAL_AUTH"), "true", StringComparison.OrdinalIgnoreCase);

    /// <summary>Shared dev signing secret for LOCAL_AUTH JWTs. Issuer and validators must agree.</summary>
    public const string DefaultLocalSecret = "snapaccount-local-dev-secret-change-me-32++chars";

    private string LocalAuthSecret =>
        configuration["LOCAL_AUTH:SECRET"]
        ?? Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET")
        ?? DefaultLocalSecret;

    public async Task InvokeAsync(HttpContext context)
    {
        var authHeader = context.Request.Headers[AuthorizationHeader].FirstOrDefault();

        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var idToken = authHeader[BearerPrefix.Length..];

            // ── Dev bypass: NEVER enabled in staging/production ──
            if (DevBypassEnabled && DevAuthTokens.TryGetValue(idToken, out var devClaims))
            {
                logger.LogWarning("DEV_AUTH_BYPASS active — accepted canned token {TokenPrefix}*** for {Path}",
                    idToken.Length > 8 ? idToken[..8] : idToken,
                    context.Request.Path);
                context.Items["FirebaseUid"] = devClaims["firebase_uid"];
                context.Items["FirebaseClaims"] = devClaims;
                // Mark request as authenticated for ASP.NET authorization pipeline
                context.User = new System.Security.Claims.ClaimsPrincipal(
                    new System.Security.Claims.ClaimsIdentity(
                        [
                            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, devClaims["firebase_uid"].ToString()!),
                            new System.Security.Claims.Claim("userId", devClaims["userId"].ToString()!),
                        ],
                        authenticationType: "DevBypass"));
                await next(context);
                return;
            }

            // ── Local auth: validate a locally-issued JWT. NEVER enabled in staging/prod ──
            if (LocalAuthEnabled)
            {
                var payload = LocalJwt.Validate(idToken, LocalAuthSecret);
                if (payload is { } p)
                {
                    var claims = new Dictionary<string, object>(StringComparer.Ordinal);
                    foreach (var prop in p.EnumerateObject())
                        claims[prop.Name] = prop.Value;

                    var uid = p.TryGetProperty("firebase_uid", out var fuid) ? fuid.ToString()
                        : p.TryGetProperty("userId", out var uidEl) ? uidEl.ToString()
                        : Guid.Empty.ToString();

                    context.Items["FirebaseUid"] = uid;
                    context.Items["FirebaseClaims"] = claims;
                    context.User = new System.Security.Claims.ClaimsPrincipal(
                        new System.Security.Claims.ClaimsIdentity(
                            [
                                new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, uid),
                                new System.Security.Claims.Claim("userId", uid),
                            ],
                            authenticationType: "LocalAuth"));
                }
                else
                {
                    logger.LogWarning("LOCAL_AUTH: invalid/expired local token for {Path}.", context.Request.Path);
                }

                // In local mode Firebase is not configured — never attempt Firebase verification.
                await next(context);
                return;
            }

            try
            {
                var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);

                // Store decoded token claims in HttpContext.Items for the CurrentUser service
                context.Items["FirebaseDecodedToken"] = decodedToken;
                context.Items["FirebaseUid"] = decodedToken.Uid;
                context.Items["FirebaseClaims"] = decodedToken.Claims;
            }
            catch (FirebaseAuthException ex)
            {
                // SEC-022: Log warning with path context when token is present but invalid.
                // Do not short-circuit — let the endpoint's RequireAuthorization() handle rejection.
                logger.LogWarning(
                    "Invalid Firebase token received for {Path}. Token will not be set in context.",
                    context.Request.Path);
                _ = ex; // token verification failed — user not authenticated
            }
        }

        await next(context);
    }
}
