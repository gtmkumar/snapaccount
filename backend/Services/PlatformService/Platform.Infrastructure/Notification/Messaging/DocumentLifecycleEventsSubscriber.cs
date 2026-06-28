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
/// DG-NOTIF-01: Pub/Sub subscriber for document lifecycle events published by FinanceService.
/// Topic: snapaccount.document.events
/// Subscription: notification-service-document-lifecycle-sub
///
/// Handled events:
///   ClarificationRequested → DOC_CLARIFICATION_REQUESTED (Push, InApp)
///
/// The document OCR-completed notification is handled by <see cref="DocumentEventsSubscriber"/>
/// which subscribes to the separate <c>snapaccount.document.ocr.completed</c> topic.
/// </summary>
public sealed class DocumentLifecycleEventsSubscriber(
    IConfiguration configuration,
    IServiceProvider services,
    ILogger<DocumentLifecycleEventsSubscriber> logger) : BackgroundService
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
                "DocumentLifecycleEventsSubscriber: GCP_PROJECT_ID not configured — document lifecycle notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_DOCUMENT_LIFECYCLE"]
            ?? "notification-service-document-lifecycle-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation(
                "DocumentLifecycleEventsSubscriber: Listening on {Subscription}", subscriptionName);

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
                    var payload = JsonSerializer.Deserialize<DocumentLifecyclePayload>(json, JsonOptions);
                    if (payload is null || payload.DocumentId == Guid.Empty)
                    {
                        logger.LogWarning(
                            "DocumentLifecycleEventsSubscriber: unreadable message {MsgId}: {Json}", msgId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    await DispatchAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex,
                        "DocumentLifecycleEventsSubscriber: failed for message {MsgId}", msgId);
                    lock (_processedIds) { _processedIds.Remove(msgId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DocumentLifecycleEventsSubscriber: could not start subscriber.");
        }
    }

    private async Task DispatchAsync(DocumentLifecyclePayload payload, CancellationToken ct)
    {
        var eventCode = payload.EventType switch
        {
            "ClarificationRequested" => "DOC_CLARIFICATION_REQUESTED",
            _ => null
        };

        if (eventCode is null)
        {
            logger.LogDebug(
                "DocumentLifecycleEventsSubscriber: no mapping for event type '{EventType}' — skipping",
                payload.EventType);
            return;
        }

        if (payload.UserId == Guid.Empty)
        {
            logger.LogWarning(
                "DocumentLifecycleEventsSubscriber: empty UserId for document {DocumentId} — skipping",
                payload.DocumentId);
            return;
        }

        var variables = new Dictionary<string, string>
        {
            ["documentId"] = payload.DocumentId.ToString(),
            ["orgId"]      = payload.OrgId.ToString(),
            ["message"]    = payload.Message ?? ""
        };

        using var scope = services.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        var command = new SendNotificationCommand(
            UserId: payload.UserId,
            EventCode: eventCode,
            Locale: "en",
            Variables: variables.AsReadOnly());

        var result = await mediator.Send(command, ct);
        if (result.IsFailure)
            logger.LogWarning(
                "DocumentLifecycleEventsSubscriber: dispatch failed for doc {DocumentId}: {Error}",
                payload.DocumentId, result.Error.Message);
        else
            logger.LogInformation(
                "DocumentLifecycleEventsSubscriber: dispatched {EventCode} for doc {DocumentId}",
                eventCode, payload.DocumentId);
    }

    private sealed record DocumentLifecyclePayload(
        string EventType,
        Guid OrgId,
        Guid DocumentId,
        Guid UserId,
        string? Message);
}
