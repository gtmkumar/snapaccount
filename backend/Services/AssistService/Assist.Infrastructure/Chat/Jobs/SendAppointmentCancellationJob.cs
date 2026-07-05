using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace ChatService.Infrastructure.Jobs;

/// <summary>
/// Hangfire one-shot job that publishes <c>APPT_CANCELLED_BY_CA</c> to Pub/Sub
/// when a CA cancels an appointment.
///
/// DG-CHAT-03: Ensures the booking user receives a Push/SMS alert via PlatformService's
/// NotificationService. Uses the same <c>snapaccount.appointment.reminder</c> topic so
/// only one subscriber is needed on the notification side.
///
/// In local dev / CI (no GCP): <see cref="IPubSubPublisher"/> is null (not registered);
/// the job logs informationally and returns — silent degradation.
/// </summary>
public sealed class SendAppointmentCancellationJob(
    IServiceScopeFactory scopeFactory,
    ILogger<SendAppointmentCancellationJob> logger)
{
    /// <summary>Entry point called by Hangfire immediately after the CA cancels.</summary>
    public async Task RunAsync(
        Guid appointmentId,
        Guid userId,
        Guid organizationId,
        string cancellationReason)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var publisher = scope.ServiceProvider.GetService<IPubSubPublisher>();

        if (publisher is null)
        {
            logger.LogInformation(
                "SendAppointmentCancellationJob: IPubSubPublisher not registered (local dev) — " +
                "skipping APPT_CANCELLED_BY_CA for appointment {Id}.", appointmentId);
            return;
        }

        var payload = new AppointmentCancellationPayload(
            AppointmentId: appointmentId,
            UserId: userId,
            OrganizationId: organizationId,
            EventCode: "APPT_CANCELLED_BY_CA",
            CancellationReason: cancellationReason);

        try
        {
            await publisher.PublishAsync("snapaccount.appointment.reminder", payload);
            logger.LogInformation(
                "SendAppointmentCancellationJob: published APPT_CANCELLED_BY_CA for appointment {Id}, user {UserId}.",
                appointmentId, userId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "SendAppointmentCancellationJob: Pub/Sub publish failed for appointment {Id}.",
                appointmentId);
            throw; // Hangfire will retry.
        }
    }
}

/// <summary>Payload published to snapaccount.appointment.reminder (cancellation path).</summary>
internal sealed record AppointmentCancellationPayload(
    Guid AppointmentId,
    Guid UserId,
    Guid OrganizationId,
    string EventCode,
    string CancellationReason) : DomainEvent;
