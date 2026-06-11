using ChatService.Domain.Enums;
using ChatService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// An expert-consultation appointment between an SME org/user and a CA.
/// Canonical table: chat.appointments (migration 080).
///
/// State machine: DRAFT → CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
/// Reschedule: CONFIRMED → CONFIRMED (new slot).
/// Cancellation rule: must be ≥ 2 hours before slot start.
/// Rating: one rating per appointment, only after COMPLETED.
/// </summary>
public sealed class Appointment : BaseAuditableEntity
{
    /// <summary>Organisation that booked this appointment.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>User within the org who made the booking.</summary>
    public Guid BookedByUserId { get; private set; }

    /// <summary>CA profile being booked.</summary>
    public Guid CaProfileId { get; private set; }

    /// <summary>The slot booked for this appointment.</summary>
    public Guid SlotId { get; private set; }

    /// <summary>Current status.</summary>
    public AppointmentStatus Status { get; private set; } = AppointmentStatus.Draft;

    /// <summary>
    /// Google Meet or provider-generated meeting link.
    /// Populated on CONFIRMED state by <see cref="IMeetingLinkProvider"/>.
    /// </summary>
    public string? MeetLink { get; private set; }

    /// <summary>
    /// Consult topic chosen at booking (e.g. ACCOUNTING, GST, ITR, LOAN, OTHER).
    /// Max 50 chars; optional for backward-compat with pre-086 rows.
    /// Migration 086: additive nullable column chat.appointments.topic.
    /// </summary>
    public string? Topic { get; private set; }

    /// <summary>Optional agenda / notes from the SME user.</summary>
    public string? Notes { get; private set; }

    /// <summary>Star rating (1–5) given after completion. Null until rated.</summary>
    public int? RatingStars { get; private set; }

    /// <summary>Comment accompanying the rating.</summary>
    public string? RatingComment { get; private set; }

    /// <summary>Timestamp when the rating was submitted.</summary>
    public DateTime? RatedAt { get; private set; }

    /// <summary>
    /// Reason provided by the CA when they initiate a cancellation.
    /// Null for user-initiated cancellations.
    /// </summary>
    public string? CaCancellationReason { get; private set; }

    /// <summary>
    /// True when the cancellation was initiated by the CA (not subject to 2-hour rule).
    /// False for user-initiated cancellations.
    /// </summary>
    public bool CancelledByCa { get; private set; }

    private Appointment() { }

    /// <summary>Books an appointment in DRAFT state (not yet confirmed / linked).</summary>
    public static Appointment Create(
        Guid organizationId,
        Guid bookedByUserId,
        Guid caProfileId,
        Guid slotId,
        string? notes = null,
        string? topic = null)
        => new()
        {
            OrganizationId = organizationId,
            BookedByUserId = bookedByUserId,
            CaProfileId = caProfileId,
            SlotId = slotId,
            Status = AppointmentStatus.Draft,
            Notes = notes,
            Topic = topic
        };

    /// <summary>
    /// Confirms the appointment and sets the meeting link.
    /// Raises <see cref="AppointmentBookedEvent"/> for Pub/Sub fan-out (reminder scheduling).
    /// </summary>
    public Result Confirm(string meetLink, DateTime slotStartUtc)
    {
        if (Status != AppointmentStatus.Draft)
            return Result.Failure(Error.Conflict("Appointment.AlreadyConfirmed", "Appointment is not in DRAFT state."));

        Status = AppointmentStatus.Confirmed;
        MeetLink = meetLink;

        AddDomainEvent(new AppointmentBookedEvent(Id, OrganizationId, BookedByUserId, CaProfileId, slotStartUtc, meetLink));
        return Result.Success();
    }

    /// <summary>
    /// Reschedules a CONFIRMED appointment to a new slot.
    /// Enforces the ≥ 2-hour cancellation rule against the original slot's start time.
    /// </summary>
    public Result Reschedule(Guid newSlotId, DateTime currentSlotStartUtc, string? newMeetLink = null)
    {
        if (Status != AppointmentStatus.Confirmed)
            return Result.Failure(Error.Conflict("Appointment.NotConfirmed", "Only confirmed appointments can be rescheduled."));

        var twoHoursBeforeSlot = currentSlotStartUtc.AddHours(-2);
        if (DateTime.UtcNow >= twoHoursBeforeSlot)
            return Result.Failure(Error.Validation(
                "Appointment.TooLateToReschedule",
                "Appointments can only be rescheduled at least 2 hours before the slot start."));

        SlotId = newSlotId;
        if (newMeetLink != null) MeetLink = newMeetLink;
        return Result.Success();
    }

    /// <summary>
    /// Cancels a CONFIRMED appointment.
    /// Enforces the ≥ 2-hour rule — returns a Result failure if within the window.
    /// </summary>
    public Result Cancel(DateTime slotStartUtc)
    {
        if (Status is AppointmentStatus.Completed or AppointmentStatus.Cancelled)
            return Result.Failure(Error.Conflict("Appointment.AlreadyClosed", "Appointment is already completed or cancelled."));

        if (Status == AppointmentStatus.Confirmed)
        {
            var twoHoursBeforeSlot = slotStartUtc.AddHours(-2);
            if (DateTime.UtcNow >= twoHoursBeforeSlot)
                return Result.Failure(Error.Validation(
                    "Appointment.TooLateToCancel",
                    "Appointments can only be cancelled at least 2 hours before the slot start."));
        }

        Status = AppointmentStatus.Cancelled;
        return Result.Success();
    }

    /// <summary>
    /// CA-initiated cancellation — bypasses the ≥ 2-hour rule.
    /// The caller is responsible for sending a notification to the booking user.
    /// Raises <see cref="AppointmentCancelledByCaEvent"/> so NotificationService can inform the user.
    /// </summary>
    public Result CancelByCa(string reason)
    {
        if (Status is AppointmentStatus.Completed or AppointmentStatus.Cancelled)
            return Result.Failure(Error.Conflict("Appointment.AlreadyClosed", "Appointment is already completed or cancelled."));

        if (string.IsNullOrWhiteSpace(reason))
            return Result.Failure(Error.Validation("Appointment.CancellationReasonRequired",
                "A cancellation reason is required for CA-initiated cancellations."));

        CaCancellationReason = reason.Trim();
        CancelledByCa = true;
        Status = AppointmentStatus.Cancelled;

        AddDomainEvent(new AppointmentCancelledByCaEvent(Id, OrganizationId, BookedByUserId, CaProfileId, CaCancellationReason));
        return Result.Success();
    }

    /// <summary>Marks the appointment as completed (called by CA or system after meeting ends).</summary>
    public Result Complete()
    {
        if (Status != AppointmentStatus.Confirmed)
            return Result.Failure(Error.Conflict("Appointment.NotConfirmed", "Only confirmed appointments can be completed."));

        Status = AppointmentStatus.Completed;
        return Result.Success();
    }

    /// <summary>Marks the appointment as a no-show.</summary>
    public Result MarkNoShow()
    {
        if (Status != AppointmentStatus.Confirmed)
            return Result.Failure(Error.Conflict("Appointment.NotConfirmed", "Only confirmed appointments can be marked no-show."));

        Status = AppointmentStatus.NoShow;
        return Result.Success();
    }

    /// <summary>
    /// Rates a completed appointment (1–5 stars + optional comment).
    /// One rating per appointment — returns failure if already rated.
    /// </summary>
    public Result Rate(int stars, string? comment)
    {
        if (Status != AppointmentStatus.Completed)
            return Result.Failure(Error.Validation("Appointment.NotCompleted", "Only completed appointments can be rated."));

        if (RatingStars.HasValue)
            return Result.Failure(Error.Conflict("Appointment.AlreadyRated", "This appointment has already been rated."));

        if (stars < 1 || stars > 5)
            return Result.Failure(Error.Validation("Appointment.InvalidRating", "Rating must be between 1 and 5."));

        RatingStars = stars;
        RatingComment = comment;
        RatedAt = DateTime.UtcNow;
        return Result.Success();
    }
}
