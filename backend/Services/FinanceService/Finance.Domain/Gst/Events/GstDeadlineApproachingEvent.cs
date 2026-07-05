using SnapAccount.Shared.Domain;

namespace GstService.Domain.Events;

/// <summary>
/// Raised when a GST filing deadline is approaching (D-7, D-3, D-1) or overdue (D+1).
/// NotificationService subscribes to dispatch alerts to the org admin and CA.
/// Priority is HIGH when DaysUntilDue is negative (overdue).
/// </summary>
public sealed record GstDeadlineApproachingEvent(
    Guid GstReturnId,
    Guid OrganizationId,
    string ReturnType,
    DateOnly DueDate,
    int DaysUntilDue) : DomainEvent
{
    /// <summary>HIGH priority when overdue; NORMAL otherwise.</summary>
    public string Priority => DaysUntilDue < 0 ? "HIGH" : "NORMAL";
}
