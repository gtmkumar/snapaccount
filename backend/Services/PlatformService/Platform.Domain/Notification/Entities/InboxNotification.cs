namespace NotificationService.Domain.Entities;

/// <summary>
/// In-app notification inbox record, mapped to the partitioned
/// <c>notification.notification</c> table (built by SQL migrations 008/017).
/// The dispatch pipeline (InAppChannelAdapter) owns writes via
/// <see cref="Create"/>; the GetInbox query reads the same rows.
/// </summary>
public class InboxNotification
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Channel { get; private set; } = string.Empty;
    public string EventType { get; private set; } = string.Empty;
    public string Title { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public bool IsRead { get; private set; }
    public DateTime? ReadAt { get; private set; }
    public string Status { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    /// <summary>Entity type the notification relates to (e.g. 'GST_RETURN', 'LOAN_APPLICATION').</summary>
    public string? ReferenceType { get; private set; }

    /// <summary>PK of the linked entity for deep-link navigation.</summary>
    public Guid? ReferenceId { get; private set; }

    /// <summary>Arbitrary JSON payload — stores deepLinkUrl, deepLinkLabel, linkedEntityLabel, category.</summary>
    public string? DataPayload { get; private set; }

    private InboxNotification() { }

    /// <summary>
    /// Factory used by <c>InAppChannelAdapter</c> to write an inbox row.
    /// <c>Channel</c> is always <c>"IN_APP"</c> (matches the DB CHECK constraint).
    /// <c>Status</c> is set to <c>"SENT"</c> on initial delivery.
    /// </summary>
    public static InboxNotification Create(
        Guid userId,
        string eventType,
        string title,
        string body,
        string? referenceType = null,
        Guid? referenceId = null,
        string? dataPayload = null)
        => new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Channel = "IN_APP",
            EventType = eventType,
            Title = title,
            Body = body,
            IsRead = false,
            Status = "SENT",
            CreatedAt = DateTime.UtcNow,
            DeletedAt = null,
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            DataPayload = dataPayload
        };

    /// <summary>
    /// Marks the inbox notification as read by the recipient.
    /// Idempotent — calling again when already read is a no-op.
    /// </summary>
    public void MarkAsRead()
    {
        if (IsRead) return;
        IsRead = true;
        ReadAt = DateTime.UtcNow;
        Status = "READ";
    }
}
