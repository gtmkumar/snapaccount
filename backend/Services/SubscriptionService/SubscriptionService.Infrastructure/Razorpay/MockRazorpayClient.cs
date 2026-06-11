using Microsoft.Extensions.Logging;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Infrastructure.Razorpay;

/// <summary>
/// Mock Razorpay adapter for local development and unit tests.
/// Returns deterministic fake results with a "mock_" prefix on IDs.
/// No HTTP calls are made.
/// </summary>
public sealed class MockRazorpayClient(ILogger<MockRazorpayClient> logger) : IRazorpayClient
{
    /// <inheritdoc />
    public Task<RazorpayOrderResult> CreateOrderAsync(
        long amountPaise,
        string receiptId,
        Dictionary<string, string>? notes = null,
        CancellationToken cancellationToken = default)
    {
        logger.LogWarning(
            "MockRazorpayClient: CreateOrder called (amount={AmountPaise} paise, receipt={Receipt}). " +
            "No real payment will be processed.",
            amountPaise, receiptId);

        return Task.FromResult(new RazorpayOrderResult(
            OrderId:     $"mock_order_{Guid.NewGuid():N}",
            Status:      "created",
            AmountPaise: amountPaise,
            Currency:    "INR",
            ReceiptId:   receiptId));
    }

    /// <inheritdoc />
    public Task<RazorpaySubscriptionResult> CreateSubscriptionAsync(
        string planId,
        int totalCount,
        Dictionary<string, string>? notes = null,
        CancellationToken cancellationToken = default)
    {
        logger.LogWarning(
            "MockRazorpayClient: CreateSubscription called (planId={PlanId}, totalCount={TotalCount}). " +
            "No real subscription will be created.",
            planId, totalCount);

        return Task.FromResult(new RazorpaySubscriptionResult(
            SubscriptionId: $"mock_sub_{Guid.NewGuid():N}",
            Status:         "created",
            TotalCount:     totalCount,
            PaidCount:      0,
            ShortUrl:       null));
    }

    /// <inheritdoc />
    public Task<RazorpayPlanResult> SyncPlanAsync(
        string planName,
        long intervalAmountPaise,
        string period,
        int interval = 1,
        CancellationToken cancellationToken = default)
    {
        logger.LogWarning(
            "MockRazorpayClient: SyncPlan called (name={PlanName}, amount={Amount} paise, period={Period}).",
            planName, intervalAmountPaise, period);

        return Task.FromResult(new RazorpayPlanResult(
            PlanId:              $"mock_plan_{Guid.NewGuid():N}",
            Name:                planName,
            IntervalAmountPaise: intervalAmountPaise,
            Period:              period,
            Interval:            interval));
    }

    // GAP-PCI-01: VerifyWebhookSignature removed from the interface.
    // Webhook signature verification is performed in the endpoint (constant-time HMAC).
}
