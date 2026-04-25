using MediatR;
using Microsoft.Extensions.Caching.Distributed;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Webhooks.Commands.HandleRazorpayWebhook;
using System.Security.Cryptography;
using System.Text;

namespace SubscriptionService.Api.Endpoints;

/// <summary>
/// POST /subscriptions/webhooks/razorpay
/// SEC-051: Razorpay webhook receiver with HMAC-SHA256 signature verification.
/// - Reads raw body BEFORE any model-binding to compute HMAC.
/// - Uses CryptographicOperations.FixedTimeEquals to prevent timing attacks.
/// - Reads shared secret from config key "RAZORPAY_WEBHOOK_SECRET".
/// - Idempotency via distributed cache keyed on X-Razorpay-Event-Id (TTL 24h).
/// - NOT behind FirebaseAuthMiddleware — webhook is server-to-server (no user JWT).
/// - Processes: subscription.charged, subscription.cancelled.
/// </summary>
public sealed class RazorpayWebhook : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/subscriptions/webhooks";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        // POST /subscriptions/webhooks/razorpay
        // No .RequireAuthorization() — webhook uses HMAC, not Firebase JWT.
        g.MapPost("/razorpay", HandleWebhook)
            .WithName("RazorpayWebhook")
            .WithSummary("SEC-051: Razorpay webhook endpoint. HMAC-SHA256 verified. No Firebase JWT required.")
            .AllowAnonymous();
    }

    private static async Task<IResult> HandleWebhook(
        HttpContext httpContext,
        IConfiguration configuration,
        ISender sender,
        IDistributedCache cache,
        CancellationToken ct)
    {
        // ── 1. Read raw body ─────────────────────────────────────────────────
        httpContext.Request.EnableBuffering();
        using var reader = new StreamReader(
            httpContext.Request.Body, Encoding.UTF8, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync(ct);
        httpContext.Request.Body.Position = 0;

        // ── 2. HMAC-SHA256 signature verification ────────────────────────────
        var signature = httpContext.Request.Headers["X-Razorpay-Signature"].FirstOrDefault();
        if (string.IsNullOrEmpty(signature))
        {
            return Results.Problem(
                "Missing X-Razorpay-Signature header.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var secret = configuration["RAZORPAY_WEBHOOK_SECRET"];
        if (string.IsNullOrEmpty(secret))
        {
            // Misconfigured — fail closed, log but don't leak the reason externally
            return Results.Problem(
                "Webhook not configured.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (!VerifyHmac(rawBody, signature, secret))
        {
            return Results.Problem(
                "Invalid webhook signature.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        // ── 3. Idempotency: deduplicate on X-Razorpay-Event-Id ───────────────
        var eventId = httpContext.Request.Headers["X-Razorpay-Event-Id"].FirstOrDefault();
        if (!string.IsNullOrEmpty(eventId))
        {
            var cacheKey = $"rzp:webhook:dedupe:{eventId}";
            var seen = await cache.GetStringAsync(cacheKey, ct);
            if (seen != null)
                return Results.Ok(new { status = "duplicate", eventId });

            await cache.SetStringAsync(
                cacheKey,
                "1",
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24)
                },
                ct);
        }

        // ── 4. Dispatch to Application handler ───────────────────────────────
        var result = await sender.Send(
            new HandleRazorpayWebhookCommand(rawBody), ct);

        if (!result.IsSuccess)
        {
            return result.Error.Type switch
            {
                ErrorType.NotFound => Results.NotFound(new { result.Error.Code, result.Error.Message }),
                ErrorType.Validation => Results.UnprocessableEntity(new { result.Error.Code, result.Error.Message }),
                _ => Results.Problem(result.Error.Message, statusCode: 500)
            };
        }

        return Results.Ok(new { status = "processed" });
    }

    /// <summary>
    /// SEC-051: HMAC-SHA256 verification using constant-time comparison.
    /// Prevents timing attacks — uses CryptographicOperations.FixedTimeEquals.
    /// </summary>
    private static bool VerifyHmac(string payload, string signature, string secret)
    {
        try
        {
            var keyBytes = Encoding.UTF8.GetBytes(secret);
            var payloadBytes = Encoding.UTF8.GetBytes(payload);

            using var hmac = new HMACSHA256(keyBytes);
            var computedBytes = hmac.ComputeHash(payloadBytes);
            var computedHex = Convert.ToHexString(computedBytes).ToLowerInvariant();

            var computedHexBytes = Encoding.UTF8.GetBytes(computedHex);
            var signatureBytes = Encoding.UTF8.GetBytes(signature.ToLowerInvariant());

            if (computedHexBytes.Length != signatureBytes.Length)
                return false;

            // SEC-051: constant-time comparison to prevent timing attacks
            return CryptographicOperations.FixedTimeEquals(computedHexBytes, signatureBytes);
        }
        catch
        {
            return false;
        }
    }
}
