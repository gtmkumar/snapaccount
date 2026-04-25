using SnapAccount.Shared.Domain;

namespace GstService.Domain.Events;

/// <summary>
/// Raised when a GST notice is assigned to a CA for response.
/// NotificationService subscribes to route an alert to the CA.
/// </summary>
public sealed record GstNoticeAssignedToCaEvent(Guid NoticeId, Guid OrganizationId, Guid CaId) : DomainEvent;
