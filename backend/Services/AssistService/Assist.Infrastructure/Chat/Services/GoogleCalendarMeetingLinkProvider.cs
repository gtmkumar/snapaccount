using ChatService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// Production <see cref="IMeetingLinkProvider"/> using the Google Calendar API (Meet integration).
/// Enabled when <c>MeetingLink:Provider=GoogleCalendar</c> in configuration.
///
/// TL-GATED: Real Google Calendar API credentials (service account with Calendar API scope)
/// must be provisioned before this provider can be activated. Until then the provider
/// falls back to a deterministic fake Meet URL (same pattern as <see cref="MockMeetingLinkProvider"/>)
/// regardless of whether credentials are present or absent — never throws.
///
/// When <c>MeetingLink:GoogleCalendar:ServiceAccountJson</c> is populated in Secret Manager,
/// replace the fallback block below with a real Google.Apis.Calendar.v3 events.insert call
/// using <c>conferenceData.createRequest.conferenceSolutionKey.type = "hangoutsMeet"</c>.
/// Reference: https://developers.google.com/calendar/api/v3/reference/events/insert
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

        // DG-CHAT-08 fix: always fall back to a deterministic fake URL regardless of whether
        // credentials are present or absent. The real Calendar API call is TL-gated on credentials
        // that are not yet provisioned. Throwing NotImplementedException here breaks BookAppointment
        // (which awaits this method inside a Result handler) when the provider is configured but
        // the real implementation has not been deployed — the safe failure mode is a mock URL + warning.
        if (!string.IsNullOrEmpty(serviceAccountJson))
        {
            // TODO (TL-GATED): Replace this block with the real Google Calendar events.insert call.
            // The service account JSON is configured; once Google.Apis.Calendar.v3 NuGet is added,
            // use GoogleCredential.FromJson(serviceAccountJson).CreateScoped(CalendarService.Scope.Calendar)
            // to build a CalendarService, insert an Event with conferenceData.createRequest (type=hangoutsMeet),
            // and return the generated Event.HangoutLink.
            logger.LogWarning(
                "GoogleCalendarMeetingLinkProvider: service account JSON is configured but the real " +
                "Google Calendar API call is not yet implemented (TL-gated on credential provisioning). " +
                "Falling back to deterministic fake Meet URL for appointment {AppointmentId}. " +
                "Implement the events.insert call in GoogleCalendarMeetingLinkProvider.cs when ready.",
                appointmentId);
        }
        else
        {
            logger.LogWarning(
                "GoogleCalendarMeetingLinkProvider: MeetingLink:GoogleCalendar:ServiceAccountJson is not configured. " +
                "Falling back to deterministic fake Meet URL for appointment {AppointmentId}. " +
                "Set in Secret Manager to enable real Google Meet links.",
                appointmentId);
        }

        // Deterministic fallback URL — same pattern as MockMeetingLinkProvider (idempotent retries).
        var shortId = appointmentId.ToString("N")[..8];
        var dateTag = slotStartUtc.ToString("yyyyMMdd");
        return Task.FromResult($"https://meet.google.com/snap-{shortId}-{dateTag}");
    }
}
