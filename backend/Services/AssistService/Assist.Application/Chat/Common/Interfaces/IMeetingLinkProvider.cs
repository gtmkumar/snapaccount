namespace ChatService.Application.Common.Interfaces;

/// <summary>
/// Generates meeting links for confirmed appointments.
/// Default implementation: <see cref="MockMeetingLinkProvider"/> (deterministic fake Meet URLs).
/// Production implementation: <c>GoogleCalendarMeetingLinkProvider</c> — enabled via
/// <c>MeetingLink:Provider=GoogleCalendar</c> in configuration when real credentials are provisioned.
/// </summary>
public interface IMeetingLinkProvider
{
    /// <summary>
    /// Generates a meeting link for the appointment.
    /// </summary>
    /// <param name="appointmentId">The appointment to generate a link for.</param>
    /// <param name="slotStartUtc">UTC start time of the slot.</param>
    /// <param name="slotEndUtc">UTC end time of the slot.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A meeting URL string.</returns>
    Task<string> CreateMeetingLinkAsync(
        Guid appointmentId,
        DateTime slotStartUtc,
        DateTime slotEndUtc,
        CancellationToken ct);
}
