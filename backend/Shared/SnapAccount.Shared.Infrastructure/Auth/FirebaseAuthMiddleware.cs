using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// Validates Firebase ID tokens on each request and populates the current user context.
/// Uses FirebaseAdmin SDK only — NOT Microsoft.Identity.Web.
/// </summary>
public sealed class FirebaseAuthMiddleware(
    RequestDelegate next,
    ILogger<FirebaseAuthMiddleware> logger)
{
    private const string AuthorizationHeader = "Authorization";
    private const string BearerPrefix = "Bearer ";

    public async Task InvokeAsync(HttpContext context)
    {
        var authHeader = context.Request.Headers[AuthorizationHeader].FirstOrDefault();

        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var idToken = authHeader[BearerPrefix.Length..];
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
