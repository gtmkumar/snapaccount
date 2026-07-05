namespace CallbackService.Application.Common.Interfaces;

/// <summary>
/// Publishes cross-service callback events to the messaging infrastructure.
/// Decouples the Application layer from concrete Pub/Sub implementation.
///
/// DG-NOTIF-01: wires the CB_SCHEDULED notification fan-out so the customer
/// receives a Push/SMS alert when their callback is confirmed with a scheduled time.
/// </summary>
public interface ICallbackEventPublisher
{
    /// <summary>
    /// Publishes a callback-confirmed event so the NotificationService subscriber
    /// can dispatch Push/SMS to the customer.
    /// </summary>
    /// <param name="callbackId">The callback identifier.</param>
    /// <param name="userId">The customer who requested the callback (notification target).</param>
    /// <param name="scheduledAt">The confirmed scheduled time (UTC).</param>
    /// <param name="ct">Cancellation token.</param>
    Task PublishCallbackScheduledAsync(
        Guid callbackId,
        Guid userId,
        DateTime scheduledAt,
        CancellationToken ct = default);
}
