using SnapAccount.Shared.Domain;

namespace NotificationService.Domain.Entities;

/// <summary>
/// Dead-letter queue item — notification messages that exhausted all retry attempts.
/// Stored in <c>notification.dlq_items</c>.
/// An operator can retry a DLQ item via <c>POST /notifications/dlq/{id}/retry</c>.
/// RLS: user-scoped with implicit bypass when user_id IS NULL (P6-HANDOFF-06).
/// Operator tooling must use the BYPASSRLS <c>snapaccount_admin</c> role.
/// </summary>
public class DlqItem : BaseAuditableEntity
{
    public Guid? UserId { get; private set; }
    public string EventCode { get; private set; } = string.Empty;
    public NotificationChannel Channel { get; private set; }
    public string Locale { get; private set; } = "en";
    public string OriginalPayload { get; private set; } = string.Empty;
    public string LastErrorMessage { get; private set; } = string.Empty;
    public int RetryCount { get; private set; }
    public DateTime ExhaustedAt { get; private set; }
    public bool IsResolved { get; private set; }

    private DlqItem() { }

    /// <summary>Creates a DLQ item from an exhausted notification dispatch.</summary>
    public static DlqItem Create(
        Guid? userId,
        string eventCode,
        NotificationChannel channel,
        string locale,
        string originalPayload,
        string lastError,
        int retryCount)
        => new()
        {
            UserId = userId,
            EventCode = eventCode,
            Channel = channel,
            Locale = locale,
            OriginalPayload = originalPayload,
            LastErrorMessage = lastError,
            RetryCount = retryCount,
            ExhaustedAt = DateTime.UtcNow
        };

    /// <summary>Marks this DLQ item as resolved after a successful retry.</summary>
    public void Resolve() => IsResolved = true;
}
