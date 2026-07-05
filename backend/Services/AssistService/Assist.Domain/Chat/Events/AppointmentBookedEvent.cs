using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>
/// Published when an appointment transitions from DRAFT → CONFIRMED.
/// NotificationService listens to this event to schedule 30-min and 5-min reminders.
/// Pub/Sub topic: appointment-booked-events.
/// </summary>
public sealed record AppointmentBookedEvent(
    Guid AppointmentId,
    Guid OrganizationId,
    Guid BookedByUserId,
    Guid CaProfileId,
    DateTime SlotStartUtc,
    string MeetLink) : DomainEvent;
