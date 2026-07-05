using ChatService.Domain.Events;
using ChatService.Infrastructure.Jobs;
using Hangfire;
using MediatR;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace ChatService.Infrastructure.EventHandlers;

/// <summary>
/// DG-CHAT-03: Handles <see cref="AppointmentCancelledByCaEvent"/> by immediately
/// pushing a cancellation notification to the booking user via Pub/Sub.
///
/// Published event code: <c>APPT_CANCELLED_BY_CA</c>.
/// The PlatformService NotificationService subscribes to the same
/// <c>snapaccount.appointment.reminder</c> topic and dispatches Push + SMS.
///
/// In local dev / CI (no GCP): <see cref="IPubSubPublisher"/> is null;
/// the Hangfire job fires immediately and the job's own null-check degrades gracefully.
/// </summary>
public sealed class AppointmentCancelledByCaEventHandler(
    IBackgroundJobClient backgroundJobClient,
    ILogger<AppointmentCancelledByCaEventHandler> logger) : INotificationHandler<AppointmentCancelledByCaEvent>
{
    /// <inheritdoc />
    public Task Handle(AppointmentCancelledByCaEvent notification, CancellationToken cancellationToken)
    {
        // Enqueue an immediate Hangfire job that publishes APPT_CANCELLED_BY_CA.
        // Using a job (rather than direct publish in the handler) keeps the domain event
        // handler synchronous and Hangfire handles retries if Pub/Sub is temporarily down.
        backgroundJobClient.Enqueue<SendAppointmentCancellationJob>(
            job => job.RunAsync(
                notification.AppointmentId,
                notification.BookedByUserId,
                notification.OrganizationId,
                notification.CancellationReason));

        logger.LogInformation(
            "AppointmentCancelledByCaEventHandler: enqueued APPT_CANCELLED_BY_CA notification " +
            "for appointment {Id}, user {UserId}.",
            notification.AppointmentId, notification.BookedByUserId);

        return Task.CompletedTask;
    }
}
