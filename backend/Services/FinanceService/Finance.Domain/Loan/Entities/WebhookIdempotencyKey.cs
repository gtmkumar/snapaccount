using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// Stores idempotency keys for webhook ingestion to prevent duplicate processing.
/// P6-HANDOFF-33: 30-day TTL for disbursement webhook idempotency keys.
/// </summary>
public class WebhookIdempotencyKey : BaseEntity
{
    /// <summary>The idempotency key from the X-Idempotency-Key header.</summary>
    public string IdempotencyKey { get; init; } = string.Empty;

    /// <summary>Bank ID that sent the webhook.</summary>
    public Guid BankId { get; init; }

    /// <summary>UTC timestamp when this key was received (for TTL enforcement).</summary>
    public DateTime ReceivedAt { get; init; }

    /// <summary>UTC expiry time (ReceivedAt + 30 days).</summary>
    public DateTime ExpiresAt { get; init; }

    /// <summary>Application ID associated with this disbursement event (for audit).</summary>
    public Guid? ApplicationId { get; init; }
}
