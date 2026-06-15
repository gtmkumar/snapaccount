using ChatService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// Default <see cref="IMeetingLinkProvider"/> implementation.
/// Generates a deterministic fake Google Meet-style URL for local development and CI.
/// Pattern: https://meet.google.com/snap-{appointmentId-first8}-{slotDate}
///
/// House pattern: mock-first. Replace with <see cref="GoogleCalendarMeetingLinkProvider"/>
/// by setting <c>MeetingLink:Provider=GoogleCalendar</c> once real credentials are provisioned
/// (TL-gated — requires Google Calendar API service account).
/// </summary>
public sealed class MockMeetingLinkProvider(ILogger<MockMeetingLinkProvider> logger) : IMeetingLinkProvider
{
    /// <inheritdoc />
    public Task<string> CreateMeetingLinkAsync(
        Guid appointmentId,
        DateTime slotStartUtc,
        DateTime slotEndUtc,
        CancellationToken ct)
    {
        // Deterministic: same appointmentId always produces the same fake URL (idempotent retries).
        var shortId = appointmentId.ToString("N")[..8];
        var dateTag = slotStartUtc.ToString("yyyyMMdd");
        var link = $"https://meet.google.com/snap-{shortId}-{dateTag}";

        logger.LogWarning(
            "MockMeetingLinkProvider: returning deterministic fake Meet URL for appointment {AppointmentId}. " +
            "Configure MeetingLink:Provider=GoogleCalendar for production use.",
            appointmentId);

        return Task.FromResult(link);
    }
}
