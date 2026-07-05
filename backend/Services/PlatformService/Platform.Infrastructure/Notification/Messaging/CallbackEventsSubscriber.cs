using Google.Cloud.PubSub.V1;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Notifications.Commands.SendNotification;
using System.Text.Json;

namespace NotificationService.Infrastructure.Messaging;

/// <summary>
/// DG-NOTIF-01: Pub/Sub subscriber for callback lifecycle events published by AssistService.
/// Topic: snapaccount.callback.events
/// Subscription: notification-service-callback-events-sub
///
/// Handled events:
///   CallbackScheduled → CB_SCHEDULED (Push, SMS)
/// </summary>
public sealed class CallbackEventsSubscriber(
    IConfiguration configuration,
    IServiceProvider services,
    ILogger<CallbackEventsSubscriber> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HashSet<string> _processedIds = new(StringComparer.Ordinal);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "CallbackEventsSubscriber: GCP_PROJECT_ID not configured — callback notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_CALLBACK_EVENTS"]
            ?? "notification-service-callback-events-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation("CallbackEventsSubscriber: Listening on {Subscription}", subscriptionName);

            await subscriber.StartAsync(async (message, ct) =>
            {
                var msgId = message.MessageId;
                lock (_processedIds)
                {
                    if (!_processedIds.Add(msgId)) return SubscriberClient.Reply.Ack;
                }

                try
                {
                    var json = message.Data.ToStringUtf8();
                    var payload = JsonSerializer.Deserialize<CallbackEventPayload>(json, JsonOptions);
                    if (payload is null || payload.CallbackId == Guid.Empty)
                    {
                        logger.LogWarning("CallbackEventsSubscriber: unreadable message {MsgId}: {Json}", msgId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    await DispatchAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "CallbackEventsSubscriber: failed for message {MsgId}", msgId);
                    lock (_processedIds) { _processedIds.Remove(msgId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "CallbackEventsSubscriber: could not start subscriber.");
        }
    }

    private async Task DispatchAsync(CallbackEventPayload payload, CancellationToken ct)
    {
        // Map event type → notification event code
        var eventCode = payload.EventType switch
        {
            "CallbackScheduled" => "CB_SCHEDULED",
            "CallbackCompleted" => "CB_COMPLETED",
            "CallbackEscalated" => "CB_ESCALATED",
            _ => null
        };

        if (eventCode is null)
        {
            logger.LogDebug("CallbackEventsSubscriber: no mapping for event type '{EventType}' — skipping",
                payload.EventType);
            return;
        }

        if (payload.UserId == Guid.Empty || payload.UserId is null)
        {
            logger.LogWarning(
                "CallbackEventsSubscriber: no userId for callback {CallbackId} — skipping notification",
                payload.CallbackId);
            return;
        }

        var scheduledIst = payload.ScheduledAt.HasValue
            ? TimeZoneInfo.ConvertTimeFromUtc(
                payload.ScheduledAt.Value,
                TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"))
                .ToString("dd MMM yyyy, hh:mm tt IST")
            : "";

        var variables = new Dictionary<string, string>
        {
            ["callbackId"]   = payload.CallbackId.ToString(),
            ["scheduledAt"]  = scheduledIst
        };

        using var scope = services.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        var command = new SendNotificationCommand(
            UserId: payload.UserId.Value,
            EventCode: eventCode,
            Locale: "en",
            Variables: variables.AsReadOnly());

        var result = await mediator.Send(command, ct);
        if (result.IsFailure)
            logger.LogWarning(
                "CallbackEventsSubscriber: dispatch failed for callback {CallbackId}: {Error}",
                payload.CallbackId, result.Error.Message);
        else
            logger.LogInformation(
                "CallbackEventsSubscriber: dispatched {EventCode} for callback {CallbackId}",
                eventCode, payload.CallbackId);
    }

    private sealed record CallbackEventPayload(
        string EventType,
        Guid CallbackId,
        Guid? UserId,
        DateTime? ScheduledAt);
}
