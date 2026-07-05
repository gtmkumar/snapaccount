using CallbackService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace CallbackService.Infrastructure.Services;

/// <summary>
/// DG-NOTIF-01: Pub/Sub implementation of <see cref="ICallbackEventPublisher"/>.
/// Publishes callback lifecycle events to <c>snapaccount.callback.events</c> topic
/// so PlatformService's NotificationService subscriber can fan-out Push/SMS to the customer.
/// </summary>
public sealed class CallbackEventPublisher(
    IPubSubPublisher publisher,
    ILogger<CallbackEventPublisher> logger) : ICallbackEventPublisher
{
    private const string TopicName = "snapaccount.callback.events";

    /// <inheritdoc />
    public async Task PublishCallbackScheduledAsync(
        Guid callbackId,
        Guid userId,
        DateTime scheduledAt,
        CancellationToken ct = default)
    {
        var payload = new CallbackScheduledEvent(
            EventType: "CallbackScheduled",
            CallbackId: callbackId,
            UserId: userId,
            ScheduledAt: scheduledAt);

        try
        {
            await publisher.PublishAsync(TopicName, payload, ct);
            logger.LogDebug(
                "CallbackEventPublisher: published CallbackScheduled for callback {CallbackId} user {UserId}",
                callbackId, userId);
        }
        catch (Exception ex)
        {
            // Log but do not rethrow — confirmation already succeeded in the DB.
            logger.LogError(ex,
                "CallbackEventPublisher: failed to publish CallbackScheduled for callback {CallbackId}. " +
                "Push notification to user {UserId} will not be delivered.",
                callbackId, userId);
        }
    }
}

/// <summary>Payload for the callback-scheduled Pub/Sub event.</summary>
internal sealed record CallbackScheduledEvent(
    string EventType,
    Guid CallbackId,
    Guid UserId,
    DateTime ScheduledAt) : DomainEvent;
