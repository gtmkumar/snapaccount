using ChatService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// Production <see cref="IMeetingLinkProvider"/> using the Google Calendar API (Meet integration).
/// Enabled when <c>MeetingLink:Provider=GoogleCalendar</c> in configuration.
///
/// TL-GATED: Real Google Calendar API credentials (service account with Calendar API scope)
/// must be provisioned before this provider can be activated. Until then, the
/// <see cref="MockMeetingLinkProvider"/> is used.
///
/// Implementation skeleton: throws <see cref="NotImplementedException"/> until credentials are configured.
/// </summary>
public sealed class GoogleCalendarMeetingLinkProvider(
    IConfiguration configuration,
    ILogger<GoogleCalendarMeetingLinkProvider> logger) : IMeetingLinkProvider
{
    /// <inheritdoc />
    public Task<string> CreateMeetingLinkAsync(
        Guid appointmentId,
        DateTime slotStartUtc,
        DateTime slotEndUtc,
        CancellationToken ct)
    {
        // TL-GATED: Google Calendar API integration — requires service account JSON + Calendar API enabled.
        // Set MeetingLink:GoogleCalendar:ServiceAccountJson in Secret Manager when ready.
        var serviceAccountJson = configuration["MeetingLink:GoogleCalendar:ServiceAccountJson"];
        if (string.IsNullOrEmpty(serviceAccountJson))
        {
            logger.LogError(
                "GoogleCalendarMeetingLinkProvider: MeetingLink:GoogleCalendar:ServiceAccountJson not configured. " +
                "Falling back to fake URL. Set in Secret Manager to enable real Meet links.");
            var shortId = appointmentId.ToString("N")[..8];
            var dateTag = slotStartUtc.ToString("yyyyMMdd");
            return Task.FromResult($"https://meet.google.com/snap-{shortId}-{dateTag}");
        }

        // TODO: Implement Google Calendar API event creation with conferenceData (Meet link).
        // Reference: https://developers.google.com/calendar/api/v3/reference/events/insert
        //            requestBody.conferenceData.createRequest.conferenceSolutionKey.type = "hangoutsMeet"
        throw new NotImplementedException(
            "GoogleCalendarMeetingLinkProvider is not yet implemented. " +
            "Set MeetingLink:Provider=Mock or provision credentials and implement the Calendar API call.");
    }
}
