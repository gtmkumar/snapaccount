using SnapAccount.Shared.Domain;

namespace NotificationService.Domain.Entities;

/// <summary>
/// Audit log entry for every notification send attempt.
/// Stored in <c>notification.notification_log</c>.
/// </summary>
public class NotificationLogEntry : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public string EventCode { get; private set; } = string.Empty;
    public NotificationChannel Channel { get; private set; }
    public string Locale { get; private set; } = "en";
    public string RenderedBody { get; private set; } = string.Empty;
    public DispatchStatus Status { get; private set; }
    public string? ProviderMessageId { get; private set; }

    /// <summary>
    /// Provider that handled the dispatch (e.g. "fcm", "msg91", "sendgrid", "test-send", "celebration").
    /// Maps to notification.notification_log.provider (VARCHAR NOT NULL, no DB default).
    /// Always set by every factory method — must never be null at persist time.
    /// The Failed() path uses "unknown" when no provider attempted the delivery.
    /// </summary>
    public string Provider { get; private set; } = string.Empty;

    public decimal CostInr { get; private set; }
    public int RetryCount { get; private set; }
    public string? ErrorMessage { get; private set; }

    /// <summary>Deduplication window key — EventCode+UserId+Channel hashed over 6h window.</summary>
    public string? DedupeKey { get; private set; }

    /// <summary>
    /// When the notification event occurred.
    /// Maps to notification.notification_log.notification_at (TIMESTAMPTZ NOT NULL, no DB default).
    /// Set explicitly in every factory method to <see cref="DateTime.UtcNow"/> at construction time.
    /// Must NOT use EF HasDefaultValueSql / ValueGeneratedOnAdd — those cause EF to omit the column
    /// from the INSERT statement, which means Postgres gets no value and raises 23502 (not-null
    /// violation) because there is no real server-side default on this column.
    /// </summary>
    public DateTime NotificationAt { get; private set; }

    private NotificationLogEntry() { }

    /// <summary>Records a successful dispatch.</summary>
    public static NotificationLogEntry Sent(
        Guid userId, string eventCode, NotificationChannel channel,
        string locale, string renderedBody, string providerMessageId, string provider,
        decimal costInr = 0, string? dedupeKey = null)
        => new()
        {
            UserId = userId,
            EventCode = eventCode,
            Channel = channel,
            Locale = locale,
            RenderedBody = renderedBody,
            Status = DispatchStatus.Sent,
            ProviderMessageId = providerMessageId,
            Provider = provider,
            CostInr = costInr,
            DedupeKey = dedupeKey,
            NotificationAt = DateTime.UtcNow
        };

    /// <summary>
    /// Records a celebration firing for per-user x per-kind deduplication.
    /// Reuses notification_log with channel=InApp so no schema change is needed.
    /// EventCode convention: <c>celebration.{kind}</c>.
    /// </summary>
    public static NotificationLogEntry CreateCelebration(Guid userId, string eventCode)
        => new()
        {
            UserId = userId,
            EventCode = eventCode,
            Channel = NotificationChannel.InApp,
            Locale = "en",
            RenderedBody = eventCode,
            Status = DispatchStatus.Sent,
            Provider = "celebration",
            CostInr = 0,
            NotificationAt = DateTime.UtcNow
        };

    /// <summary>Records a failed dispatch attempt.</summary>
    public static NotificationLogEntry Failed(
        Guid userId, string eventCode, NotificationChannel channel,
        string locale, string renderedBody, string errorMessage, int retryCount = 0, string? dedupeKey = null)
        => new()
        {
            UserId = userId,
            EventCode = eventCode,
            Channel = channel,
            Locale = locale,
            RenderedBody = renderedBody,
            Status = DispatchStatus.Failed,
            ErrorMessage = errorMessage,
            RetryCount = retryCount,
            DedupeKey = dedupeKey,
            // provider is NOT NULL in the DB (no default). "unknown" records that no provider
            // was reached (failure was pre-dispatch), satisfying the constraint without a migration.
            Provider = "unknown",
            NotificationAt = DateTime.UtcNow
        };
}
