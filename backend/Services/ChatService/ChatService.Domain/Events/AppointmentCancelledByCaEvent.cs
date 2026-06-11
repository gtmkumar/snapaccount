using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>
/// Published when a CA cancels an appointment (bypasses the 2-hour rule).
/// NotificationService listens to this event to send a push/SMS notification to the booking user.
/// Pub/Sub topic: appointment-cancelled-by-ca-events.
/// </summary>
public sealed record AppointmentCancelledByCaEvent(
    Guid AppointmentId,
    Guid OrganizationId,
    Guid BookedByUserId,
    Guid CaProfileId,
    string CancellationReason) : DomainEvent;
