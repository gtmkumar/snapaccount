namespace SubscriptionService.Application.Common.Interfaces;

/// <summary>
/// Adapter abstraction for the Razorpay REST API.
///
/// Two implementations:
/// <list type="bullet">
///   <item><see cref="RazorpayHttpClient"/> — production (live or test Razorpay API)</item>
///   <item><see cref="MockRazorpayClient"/> — local dev / unit tests (no HTTP calls)</item>
/// </list>
///
/// The adapter is registered based on the <c>RazorpayConfig.IsEnabled</c> setting in DI.
/// </summary>
public interface IRazorpayClient
{
    /// <summary>
    /// Creates a Razorpay order for a one-time payment.
    /// </summary>
    /// <param name="amountPaise">Amount in paise (INR × 100).</param>
    /// <param name="receiptId">Internal receipt reference for idempotency.</param>
    /// <param name="notes">Arbitrary key-value metadata attached to the order.</param>
    Task<RazorpayOrderResult> CreateOrderAsync(
        long amountPaise,
        string receiptId,
        Dictionary<string, string>? notes = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a Razorpay subscription (recurring billing).
    /// </summary>
    /// <param name="planId">Razorpay plan ID (rplan_*).</param>
    /// <param name="totalCount">Total billing cycles (0 = unlimited).</param>
    Task<RazorpaySubscriptionResult> CreateSubscriptionAsync(
        string planId,
        int totalCount,
        Dictionary<string, string>? notes = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates or updates a Razorpay plan (syncs our internal plan to Razorpay).
    /// </summary>
    Task<RazorpayPlanResult> SyncPlanAsync(
        string planName,
        long intervalAmountPaise,
        string period,
        int interval = 1,
        CancellationToken cancellationToken = default);

    /// <summary>Verifies the HMAC-SHA256 signature of a Razorpay webhook payload.</summary>
    bool VerifyWebhookSignature(string payload, string signature, string secret);
}

/// <summary>Represents a Razorpay order creation result.</summary>
public sealed record RazorpayOrderResult(
    string OrderId,
    string Status,
    long AmountPaise,
    string Currency,
    string? ReceiptId);

/// <summary>Represents a Razorpay subscription creation result.</summary>
public sealed record RazorpaySubscriptionResult(
    string SubscriptionId,
    string Status,
    int TotalCount,
    int PaidCount,
    string? ShortUrl);

/// <summary>Represents a Razorpay plan sync result.</summary>
public sealed record RazorpayPlanResult(
    string PlanId,
    string Name,
    long IntervalAmountPaise,
    string Period,
    int Interval);
