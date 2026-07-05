using SnapAccount.Shared.Domain;

namespace NotificationService.Domain.Entities;

/// <summary>
/// Catalogue entry for a supported notification event type.
/// Each of the 26 event types × 3 channels × 3 locales has a corresponding
/// <see cref="NotificationTemplate"/> that is seeded at startup.
/// </summary>
public class NotificationEvent : BaseAuditableEntity
{
    /// <summary>Unique code, e.g. GST_DEADLINE_7_DAYS. One of the 26 catalogue items.</summary>
    public string EventCode { get; private set; } = string.Empty;

    /// <summary>Human-readable name.</summary>
    public string EventName { get; private set; } = string.Empty;

    /// <summary>Category: GST, ITR, LOAN, SUBSCRIPTION, CALLBACK, DOCUMENT, ACCOUNT.</summary>
    public string Category { get; private set; } = string.Empty;

    /// <summary>Default channels for this event type (comma-separated: Push,Sms,Email).</summary>
    public string DefaultChannels { get; private set; } = "Push";

    /// <summary>Whether this event type is active.</summary>
    public bool IsActive { get; private set; } = true;

    private NotificationEvent() { }

    /// <summary>Creates a notification event catalogue entry.</summary>
    public static NotificationEvent Create(
        string eventCode,
        string eventName,
        string category,
        string defaultChannels = "Push")
        => new()
        {
            EventCode = eventCode,
            EventName = eventName,
            Category = category,
            DefaultChannels = defaultChannels
        };
}
