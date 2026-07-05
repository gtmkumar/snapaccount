using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace ChatService.Infrastructure.Jobs;

/// <summary>
/// Hangfire one-shot (delayed) job that fires a push/SMS reminder for an upcoming appointment.
///
/// DG-CHAT-03: Scheduled by <see cref="ChatService.Application.Chat.EventHandlers.AppointmentBookedEventHandler"/>
/// at two firing times:
///   • <c>APPT_REMINDER_30</c> — 30 minutes before slot start.
///   • <c>APPT_REMINDER_5</c>  — 5 minutes before slot start.
///
/// Uses <see cref="IPubSubPublisher"/> to publish a lightweight notification-request event to the
/// <c>snapaccount.appointment.reminder</c> Pub/Sub topic, which the PlatformService NotificationService
/// subscriber dispatches as Push + SMS.
///
/// In local dev / CI (no GCP): <see cref="IPubSubPublisher"/> is null (not registered); the job
/// logs an informational message and returns — silent degradation, no crash.
/// </summary>
public sealed class SendAppointmentReminderJob(
    IServiceScopeFactory scopeFactory,
    ILogger<SendAppointmentReminderJob> logger)
{
    /// <summary>
    /// Entry point called by Hangfire at the delayed firing time.
    /// </summary>
    /// <param name="appointmentId">The appointment to remind about.</param>
    /// <param name="eventCode">Either APPT_REMINDER_30 or APPT_REMINDER_5.</param>
    public async Task RunAsync(Guid appointmentId, string eventCode)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IChatServiceDbContext>();

        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == appointmentId &&
                                      a.DeletedAt == null);

        if (appointment is null)
        {
            logger.LogWarning(
                "SendAppointmentReminderJob: appointment {Id} not found — reminder skipped.", appointmentId);
            return;
        }

        // Only send reminders for confirmed appointments.
        if (appointment.Status != ChatService.Domain.Enums.AppointmentStatus.Confirmed)
        {
            logger.LogInformation(
                "SendAppointmentReminderJob: appointment {Id} is not CONFIRMED (status={Status}) — reminder skipped.",
                appointmentId, appointment.Status);
            return;
        }

        // Look up the slot for time context.
        var slot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == appointment.SlotId);

        // Attempt Pub/Sub publish (GCP path).
        var publisher = scope.ServiceProvider.GetService<IPubSubPublisher>();
        if (publisher is not null)
        {
            var payload = new AppointmentReminderPayload(
                AppointmentId: appointmentId,
                UserId: appointment.BookedByUserId,
                OrganizationId: appointment.OrganizationId,
                EventCode: eventCode,
                SlotStartUtc: slot?.StartUtc,
                MeetLink: appointment.MeetLink);

            try
            {
                await publisher.PublishAsync("snapaccount.appointment.reminder", payload);
                logger.LogInformation(
                    "SendAppointmentReminderJob: published {EventCode} for appointment {Id} to user {UserId}.",
                    eventCode, appointmentId, appointment.BookedByUserId);
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "SendAppointmentReminderJob: Pub/Sub publish failed for appointment {Id} ({EventCode}).",
                    appointmentId, eventCode);
                // Do not rethrow — Hangfire will retry the job automatically.
                throw;
            }
        }
        else
        {
            // Local dev / CI: no Pub/Sub available — log and skip.
            logger.LogInformation(
                "SendAppointmentReminderJob: IPubSubPublisher not registered (local dev) — " +
                "skipping {EventCode} for appointment {Id}.",
                eventCode, appointmentId);
        }
    }
}

/// <summary>Payload published to snapaccount.appointment.reminder (reminder path).</summary>
internal sealed record AppointmentReminderPayload(
    Guid AppointmentId,
    Guid UserId,
    Guid OrganizationId,
    string EventCode,
    DateTime? SlotStartUtc,
    string? MeetLink) : DomainEvent;
