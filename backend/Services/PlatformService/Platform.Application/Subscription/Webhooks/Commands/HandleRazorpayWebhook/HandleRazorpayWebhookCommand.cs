using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;
using System.Text.Json;

namespace SubscriptionService.Application.Webhooks.Commands.HandleRazorpayWebhook;

/// <summary>
/// SEC-051: Processes a verified Razorpay webhook payload.
/// Handles events: subscription.charged, subscription.cancelled.
/// HMAC verification is performed upstream in the API layer before this command is invoked.
/// </summary>
/// <param name="RawBody">Raw JSON body from Razorpay (already HMAC-verified).</param>
public record HandleRazorpayWebhookCommand(string RawBody) : ICommand<Result>;

/// <summary>Validates HandleRazorpayWebhookCommand.</summary>
public sealed class HandleRazorpayWebhookCommandValidator
    : AbstractValidator<HandleRazorpayWebhookCommand>
{
    public HandleRazorpayWebhookCommandValidator()
    {
        RuleFor(x => x.RawBody)
            .NotEmpty().WithMessage("Webhook body cannot be empty.")
            .MaximumLength(65536).WithMessage("Webhook body exceeds maximum allowed size.");
    }
}

/// <summary>
/// Handler: parses Razorpay event, routes to the correct subscription action.
/// Supported events:
///   - subscription.charged   → RecordPayment (activate/renew subscription)
///   - subscription.cancelled → Cancel subscription
/// </summary>
public sealed class HandleRazorpayWebhookCommandHandler(
    ISubscriptionServiceDbContext db,
    ILogger<HandleRazorpayWebhookCommandHandler> logger)
    : ICommandHandler<HandleRazorpayWebhookCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        HandleRazorpayWebhookCommand request,
        CancellationToken cancellationToken)
    {
        RazorpayWebhookPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<RazorpayWebhookPayload>(
                request.RawBody, JsonOptions);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "SEC-051: Failed to parse Razorpay webhook payload.");
            return Error.Validation("Webhook.InvalidJson", "Invalid JSON in webhook payload.");
        }

        if (payload is null)
            return Error.Validation("Webhook.EmptyPayload", "Empty webhook payload.");

        logger.LogInformation("SEC-051: Processing Razorpay event={Event}", payload.Event);

        return payload.Event switch
        {
            "subscription.charged" => await HandleChargedAsync(payload, cancellationToken),
            "subscription.cancelled" => await HandleCancelledAsync(payload, cancellationToken),
            _ => HandleUnknownEvent(payload.Event)
        };
    }

    // ── subscription.charged ─────────────────────────────────────────────────

    private async Task<Result<Result>> HandleChargedAsync(
        RazorpayWebhookPayload payload,
        CancellationToken ct)
    {
        var razorpaySubId = payload.Payload?.Subscription?.Entity?.Id;
        var paymentId = payload.Payload?.Payment?.Entity?.Id;
        var amount = payload.Payload?.Payment?.Entity?.Amount;

        if (string.IsNullOrEmpty(razorpaySubId) || string.IsNullOrEmpty(paymentId))
        {
            logger.LogWarning("SEC-051: subscription.charged missing required fields.");
            return Error.Validation("Webhook.MissingFields",
                "subscription.charged event missing subscription or payment id.");
        }

        var sub = await db.Subscriptions
            .Include(s => s.Invoices)
            .Where(s => s.RazorpaySubscriptionId == razorpaySubId && s.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (sub == null)
        {
            logger.LogWarning("SEC-051: subscription.charged — no subscription found for razorpay_sub_id={Id}",
                razorpaySubId);
            return Error.NotFound("Subscription.NotFound",
                $"No subscription found for Razorpay subscription ID '{razorpaySubId}'.");
        }

        // Idempotency: skip if this payment already recorded
        if (sub.Invoices.Any(i => i.RazorpayPaymentId == paymentId))
        {
            logger.LogInformation("SEC-051: payment {PaymentId} already recorded — skipping.", paymentId);
            return Result.Success();
        }

        var amountInr = amount.HasValue ? amount.Value / 100m : 0m; // Razorpay sends paise
        var newPeriodEnd = DateTime.UtcNow.AddDays(30);

        // Upsert pending invoice or create new
        var invoice = sub.Invoices.FirstOrDefault(i => i.Status == "PENDING");
        if (invoice == null)
        {
            var invoiceNumber = $"INV-RZP-{DateTime.UtcNow:yyyyMMdd}-{paymentId[^6..]}";
            invoice = Invoice.Create(
                sub.Id,
                sub.OrganizationId,
                invoiceNumber,
                amountInr,
                Math.Round(amountInr * 0.18m, 2), // GST 18% on SaaS
                sub.CurrentPeriodStart,
                newPeriodEnd);
            db.Invoices.Add(invoice);
        }

        invoice.MarkPaid(paymentId);
        sub.Renew(newPeriodEnd);

        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "SEC-051: subscription.charged processed — sub_id={SubId}, payment_id={PaymentId}",
            sub.Id, paymentId);
        return Result.Success();
    }

    // ── subscription.cancelled ───────────────────────────────────────────────

    private async Task<Result<Result>> HandleCancelledAsync(
        RazorpayWebhookPayload payload,
        CancellationToken ct)
    {
        var razorpaySubId = payload.Payload?.Subscription?.Entity?.Id;

        if (string.IsNullOrEmpty(razorpaySubId))
        {
            logger.LogWarning("SEC-051: subscription.cancelled missing subscription id.");
            return Error.Validation("Webhook.MissingFields",
                "subscription.cancelled event missing subscription id.");
        }

        var sub = await db.Subscriptions
            .Where(s => s.RazorpaySubscriptionId == razorpaySubId && s.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (sub == null)
        {
            logger.LogWarning("SEC-051: subscription.cancelled — no subscription found for razorpay_sub_id={Id}",
                razorpaySubId);
            return Error.NotFound("Subscription.NotFound",
                $"No subscription found for Razorpay subscription ID '{razorpaySubId}'.");
        }

        if (sub.Status == Domain.Enums.SubscriptionStatus.Cancelled)
        {
            logger.LogInformation("SEC-051: subscription already cancelled — idempotent ack.");
            return Result.Success();
        }

        sub.Cancel();
        await db.SaveChangesAsync(ct);
        logger.LogInformation("SEC-051: subscription.cancelled processed — sub_id={SubId}", sub.Id);
        return Result.Success();
    }

    private Result<Result> HandleUnknownEvent(string? eventName)
    {
        logger.LogInformation("SEC-051: Unhandled Razorpay event '{Event}' — acking.", eventName);
        return Result.Success(); // Ack unknown events to prevent Razorpay retry storms
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };
}

// ── Razorpay webhook payload DTOs ─────────────────────────────────────────────

/// <summary>Top-level Razorpay webhook envelope.</summary>
internal sealed class RazorpayWebhookPayload
{
    public string? Event { get; init; }
    public string? AccountId { get; init; }
    public RazorpayPayloadWrapper? Payload { get; init; }
}

/// <summary>Razorpay event.payload wrapper.</summary>
internal sealed class RazorpayPayloadWrapper
{
    public RazorpayEntityWrapper<RazorpaySubscriptionEntity>? Subscription { get; init; }
    public RazorpayEntityWrapper<RazorpayPaymentEntity>? Payment { get; init; }
}

/// <summary>Generic Razorpay entity wrapper (contains an 'entity' object).</summary>
internal sealed class RazorpayEntityWrapper<T>
{
    public T? Entity { get; init; }
}

/// <summary>Minimal Razorpay subscription entity fields used by this service.</summary>
internal sealed class RazorpaySubscriptionEntity
{
    public string? Id { get; init; }
    public string? Status { get; init; }
    public string? PlanId { get; init; }
}

/// <summary>Minimal Razorpay payment entity fields used by this service.</summary>
internal sealed class RazorpayPaymentEntity
{
    public string? Id { get; init; }
    public long? Amount { get; init; } // Razorpay sends paise (1 INR = 100 paise)
    public string? Currency { get; init; }
    public string? Status { get; init; }
}
