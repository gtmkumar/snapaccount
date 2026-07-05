using ChatService.Domain.Events;
using ChatService.Infrastructure.Jobs;
using Hangfire;
using MediatR;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.EventHandlers;

/// <summary>
/// DG-CHAT-03: Handles <see cref="AppointmentBookedEvent"/> by scheduling two delayed
/// Hangfire reminder jobs:
///   • <c>APPT_REMINDER_30</c> — fires 30 minutes before the slot start.
///   • <c>APPT_REMINDER_5</c>  — fires 5 minutes before the slot start.
///
/// Also publishes <c>APPT_BOOKED</c> inline-notification via the reminder job
/// (the user is notified at booking time through the API response; the Hangfire
/// jobs handle the pre-call reminders).
///
/// If the computed fire time is already in the past (e.g. slot starts in &lt; 30 min),
/// Hangfire will execute the job immediately rather than silently discarding it.
///
/// Cancels should not delete these jobs (Hangfire does not easily support it by
/// appointment ID), so the <see cref="SendAppointmentReminderJob"/> checks appointment
/// status before sending — if the appointment is no longer CONFIRMED the reminder is skipped.
/// </summary>
public sealed class AppointmentBookedEventHandler(
    IBackgroundJobClient backgroundJobClient,
    ILogger<AppointmentBookedEventHandler> logger) : INotificationHandler<AppointmentBookedEvent>
{
    /// <inheritdoc />
    public Task Handle(AppointmentBookedEvent notification, CancellationToken cancellationToken)
    {
        var slotStart = notification.SlotStartUtc;

        // 30-minute reminder
        var fireAt30 = slotStart.AddMinutes(-30);
        backgroundJobClient.Schedule<SendAppointmentReminderJob>(
            job => job.RunAsync(notification.AppointmentId, "APPT_REMINDER_30"),
            fireAt30);

        // 5-minute reminder
        var fireAt5 = slotStart.AddMinutes(-5);
        backgroundJobClient.Schedule<SendAppointmentReminderJob>(
            job => job.RunAsync(notification.AppointmentId, "APPT_REMINDER_5"),
            fireAt5);

        logger.LogInformation(
            "AppointmentBookedEventHandler: scheduled APPT_REMINDER_30 at {At30} and " +
            "APPT_REMINDER_5 at {At5} for appointment {Id}.",
            fireAt30, fireAt5, notification.AppointmentId);

        return Task.CompletedTask;
    }
}
