using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Application.Webhooks.Commands.HandleRazorpayWebhook;
using System.Security.Cryptography;
using System.Text;

namespace SubscriptionService.Api.Endpoints;

/// <summary>
/// POST /subscriptions/webhooks/razorpay
/// SEC-051: Razorpay webhook receiver with HMAC-SHA256 signature verification.
/// DG-SUB-03: Secret resolution order:
///   1. RazorpayConfig.EncryptedWebhookSecret (DB row, decrypted via ICredentialEncryptionService)
///   2. RAZORPAY_WEBHOOK_SECRET environment / config value (fallback)
/// - Reads raw body BEFORE any model-binding to compute HMAC.
/// - Uses CryptographicOperations.FixedTimeEquals to prevent timing attacks.
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
            .WithSummary("SEC-051/DG-SUB-03: Razorpay webhook. HMAC-SHA256 verified. " +
                         "Secret resolved from DB (EncryptedWebhookSecret) with env fallback.")
            .AllowAnonymous();
    }

    private static async Task<IResult> HandleWebhook(
        HttpContext httpContext,
        IConfiguration configuration,
        ISubscriptionServiceDbContext db,
        ICredentialEncryptionService encryption,
        ISender sender,
        IDistributedCache cache,
        ILogger<RazorpayWebhook> logger,
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

        // DG-SUB-03: Resolve webhook secret with DB-first, env fallback.
        var secret = await ResolveWebhookSecretAsync(db, encryption, configuration, logger, ct);
        if (string.IsNullOrEmpty(secret))
        {
            // Misconfigured — fail closed, log but don't leak the reason externally
            logger.LogError(
                "Razorpay webhook misconfigured: no EncryptedWebhookSecret in DB " +
                "and RAZORPAY_WEBHOOK_SECRET env var is not set. Returning 503.");
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
    /// DG-SUB-03: Resolve the webhook secret with DB-first, env fallback.
    /// Priority:
    ///   1. <c>RazorpayConfig.EncryptedWebhookSecret</c> — decrypted via AES-256-GCM.
    ///   2. <c>RAZORPAY_WEBHOOK_SECRET</c> env var / app config (backwards-compat fallback).
    /// If neither is present, returns null and the caller returns 503.
    /// </summary>
    private static async Task<string?> ResolveWebhookSecretAsync(
        ISubscriptionServiceDbContext db,
        ICredentialEncryptionService encryption,
        IConfiguration configuration,
        ILogger<RazorpayWebhook> logger,
        CancellationToken ct)
    {
        // 1. Try DB row first.
        var config = await db.RazorpayConfigs
            .Where(c => c.DeletedAt == null && c.IsEnabled)
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefaultAsync(ct);

        if (config?.EncryptedWebhookSecret is not null)
        {
            try
            {
                return encryption.Decrypt(config.EncryptedWebhookSecret);
            }
            catch (Exception ex)
            {
                // Decrypt failure (e.g. key rotation) — fall through to env var.
                logger.LogWarning(ex,
                    "Failed to decrypt RazorpayConfig.EncryptedWebhookSecret — " +
                    "falling back to RAZORPAY_WEBHOOK_SECRET env var.");
            }
        }

        // 2. Fallback to env var / appsettings.
        return configuration["RAZORPAY_WEBHOOK_SECRET"];
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
