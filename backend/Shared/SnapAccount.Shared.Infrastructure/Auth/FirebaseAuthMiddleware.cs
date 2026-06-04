using FirebaseAdmin;
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
            ["roles"] = new[] { "SUPER_ADMIN", "OPERATIONS_MANAGER" },
            // Wildcard "*" grants all permissions — without it, every [RequiresPermission]
            // endpoint (e.g. admin.dashboard.read) is denied under DEV_AUTH_BYPASS because
            // CurrentUser.HasPermission finds no "permissions" claim. Mirrors the real
            // SUPER_ADMIN session token, which resolves to ["*"].
            ["permissions"] = new[] { "*" },
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

    /// <summary>
    /// Shared dev signing secret — the insecure fallback when no session secret is configured.
    /// Issuer and validators agree on the secret via <see cref="SessionTokenSecret.Resolve"/>.
    /// </summary>
    public const string DefaultLocalSecret = "snapaccount-local-dev-secret-change-me-32++chars";

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

            // ── SnapAccount session JWT (HS256) — the unified production + local session token ──
            // AuthService mints these for every login flow (OTP / password / 2FA / social / refresh);
            // they carry userId / organizationId / roles / permissions and are validated here across
            // all services. This path also covers LOCAL_AUTH dev logins (same codec + secret).
            var sessionPayload = LocalJwt.Validate(idToken, SessionTokenSecret.Resolve(configuration));
            if (sessionPayload is { } sp)
            {
                var claims = new Dictionary<string, object>(StringComparer.Ordinal);
                foreach (var prop in sp.EnumerateObject())
                    claims[prop.Name] = prop.Value;

                var uid = sp.TryGetProperty("firebase_uid", out var fuid) ? fuid.ToString()
                    : sp.TryGetProperty("userId", out var uidEl) ? uidEl.ToString()
                    : Guid.Empty.ToString();

                context.Items["FirebaseUid"] = uid;
                context.Items["FirebaseClaims"] = claims;
                context.User = new System.Security.Claims.ClaimsPrincipal(
                    new System.Security.Claims.ClaimsIdentity(
                        [
                            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, uid!),
                            new System.Security.Claims.Claim("userId", uid!),
                        ],
                        authenticationType: "SessionJwt"));
                await next(context);
                return;
            }

            // ── Firebase ID token (fallback for legacy/native Firebase clients) ──
            // Only attempted when a Firebase app is initialised (real GCP creds present). Wrapped
            // broadly so a malformed bearer can never surface as a 500 — an unverifiable token simply
            // leaves the request unauthenticated for the endpoint's RequireAuthorization() to reject.
            if (FirebaseApp.DefaultInstance is not null)
            {
                try
                {
                    var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
                    context.Items["FirebaseDecodedToken"] = decodedToken;
                    context.Items["FirebaseUid"] = decodedToken.Uid;
                    context.Items["FirebaseClaims"] = decodedToken.Claims;
                }
                catch (Exception ex)
                {
                    // SEC-022: log with path context; never short-circuit, never 500.
                    logger.LogWarning(
                        "Unverifiable bearer token for {Path} ({Reason}). Request left unauthenticated.",
                        context.Request.Path, ex.GetType().Name);
                }
            }
        }

        await next(context);
    }
}
