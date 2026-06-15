namespace ChatService.Domain.Enums;

/// <summary>
/// Status of an <see cref="Entities.Appointment"/>.
/// SQL CHECK vocabulary: 'DRAFT','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW'.
/// </summary>
public enum AppointmentStatus
{
    /// <summary>Slot reserved but meeting link not yet generated.</summary>
    Draft = 1,

    /// <summary>Booking confirmed; meeting link issued; reminders scheduled.</summary>
    Confirmed = 2,

    /// <summary>Meeting has taken place.</summary>
    Completed = 3,

    /// <summary>Cancelled by either party (2-hour rule enforced for user cancellations).</summary>
    Cancelled = 4,

    /// <summary>User did not join the meeting.</summary>
    NoShow = 5
}
