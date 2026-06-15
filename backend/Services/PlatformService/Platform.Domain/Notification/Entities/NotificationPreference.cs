using SnapAccount.Shared.Domain;

namespace NotificationService.Domain.Entities;

/// <summary>
/// Per-user per-event-type channel preferences.
/// Also holds quiet hours and DND settings for deduplication.
/// </summary>
public class NotificationPreference : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public string EventCode { get; private set; } = string.Empty;
    public bool PushEnabled { get; private set; } = true;
    public bool SmsEnabled { get; private set; } = true;
    public bool EmailEnabled { get; private set; } = true;
    public bool InAppEnabled { get; private set; } = true;

    /// <summary>Quiet hours start (HH:mm IST, e.g. "22:00"). No notifications between start–end.</summary>
    public string? QuietHoursStart { get; private set; }

    /// <summary>Quiet hours end (HH:mm IST, e.g. "08:00").</summary>
    public string? QuietHoursEnd { get; private set; }

    /// <summary>If true, all non-critical notifications are suppressed.</summary>
    public bool DoNotDisturb { get; private set; }

    private NotificationPreference() { }

    /// <summary>Creates a default preference entry for a user/event.</summary>
    public static NotificationPreference CreateDefault(Guid userId, string eventCode)
        => new() { UserId = userId, EventCode = eventCode };

    /// <summary>Updates channel preferences.</summary>
    public void UpdateChannels(bool push, bool sms, bool email, bool inApp,
        string? quietStart = null, string? quietEnd = null, bool dnd = false)
    {
        PushEnabled = push;
        SmsEnabled = sms;
        EmailEnabled = email;
        InAppEnabled = inApp;
        QuietHoursStart = quietStart;
        QuietHoursEnd = quietEnd;
        DoNotDisturb = dnd;
    }
}
