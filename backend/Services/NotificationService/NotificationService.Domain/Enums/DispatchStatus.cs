namespace NotificationService.Domain.Entities;

/// <summary>Status of a notification dispatch attempt.</summary>
public enum DispatchStatus
{
    Queued,
    Sent,
    Delivered,
    Failed,
    Bounced,
    Suppressed // suppressed by quiet hours, DND, or dedup
}
