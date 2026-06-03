namespace NotificationService.Domain.Entities;

/// <summary>
/// Read model for a user's in-app notification inbox, mapped to the partitioned
/// <c>notification.notification</c> table (built by SQL migrations 008/017). Read-only —
/// the dispatch pipeline owns writes. Used by the GetInbox query.
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
    public string Status { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime? DeletedAt { get; private set; }
}
