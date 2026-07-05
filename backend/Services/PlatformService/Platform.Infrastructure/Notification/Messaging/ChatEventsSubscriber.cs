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
/// DG-NOTIF-01: Pub/Sub subscriber for chat new-message events published by AssistService.
/// Topic: snapaccount.chat.new-message
/// Subscription: notification-service-chat-events-sub
///
/// For each offline recipient in the event payload, dispatches
/// <see cref="SendNotificationCommand"/> with event code CHAT_NEW_MESSAGE.
/// Online participants are already served by the SignalR hub in AssistService.
/// </summary>
public sealed class ChatEventsSubscriber(
    IConfiguration configuration,
    IServiceProvider services,
    ILogger<ChatEventsSubscriber> logger) : BackgroundService
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
                "ChatEventsSubscriber: GCP_PROJECT_ID not configured — chat push notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_CHAT_EVENTS"]
            ?? "notification-service-chat-events-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation("ChatEventsSubscriber: Listening on {Subscription}", subscriptionName);

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
                    var payload = JsonSerializer.Deserialize<ChatNewMessagePayload>(json, JsonOptions);
                    if (payload is null || payload.ThreadId == Guid.Empty)
                    {
                        logger.LogWarning("ChatEventsSubscriber: unreadable message {MsgId}: {Json}", msgId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    await DispatchToRecipientsAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "ChatEventsSubscriber: failed for message {MsgId}", msgId);
                    lock (_processedIds) { _processedIds.Remove(msgId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ChatEventsSubscriber: could not start subscriber.");
        }
    }

    private async Task DispatchToRecipientsAsync(ChatNewMessagePayload payload, CancellationToken ct)
    {
        if (payload.RecipientUserIds is null || payload.RecipientUserIds.Count == 0)
        {
            logger.LogDebug(
                "ChatEventsSubscriber: no recipients for thread {ThreadId} — skipping", payload.ThreadId);
            return;
        }

        var variables = new Dictionary<string, string>
        {
            ["threadId"]   = payload.ThreadId.ToString(),
            ["messageId"]  = payload.MessageId.ToString(),
            ["snippet"]    = payload.BodySnippet ?? ""
        };

        using var scope = services.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        foreach (var userId in payload.RecipientUserIds)
        {
            // Skip sending a notification to the sender
            if (userId == payload.SenderUserId) continue;

            var command = new SendNotificationCommand(
                UserId: userId,
                EventCode: "CHAT_NEW_MESSAGE",
                Locale: "en",
                Variables: variables.AsReadOnly());

            var result = await mediator.Send(command, ct);
            if (result.IsFailure)
                logger.LogWarning(
                    "ChatEventsSubscriber: dispatch failed for user {UserId}: {Error}",
                    userId, result.Error.Message);
        }

        logger.LogInformation(
            "ChatEventsSubscriber: processed CHAT_NEW_MESSAGE for thread {ThreadId} ({Count} recipients)",
            payload.ThreadId, payload.RecipientUserIds.Count);
    }

    private sealed record ChatNewMessagePayload(
        Guid ThreadId,
        Guid MessageId,
        Guid SenderUserId,
        Guid OrgId,
        string? BodySnippet,
        IReadOnlyList<Guid>? RecipientUserIds);
}
