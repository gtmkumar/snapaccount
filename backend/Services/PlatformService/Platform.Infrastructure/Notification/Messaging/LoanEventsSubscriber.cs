using Google.Cloud.PubSub.V1;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Notifications.Commands.SendNotification;
using System.Text.Json;

namespace NotificationService.Infrastructure.Messaging;

/// <summary>
/// P6-HANDOFF-34: Pub/Sub subscriber for loan disbursement events from LoanService.
/// Topic: snapaccount.loan.events
/// Subscription: notification-service-loan-events-sub
///
/// Handled event types:
///   LoanDisbursed            → LOAN_DISBURSED
///   LoanDisbursementFailed   → LOAN_DISBURSEMENT_FAILED
///   LoanDisbursementReversed → LOAN_DISBURSEMENT_REVERSED
///
/// Idempotency: messages are deduped by MessageId in-process (cleared on process recycle).
/// </summary>
public sealed class LoanEventsSubscriber(
    IConfiguration configuration,
    IMediator mediator,
    ILogger<LoanEventsSubscriber> logger) : BackgroundService
{
    private readonly HashSet<string> _processedMessageIds = new(StringComparer.Ordinal);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "LoanEventsSubscriber: GCP_PROJECT_ID not configured — loan event notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_LOAN_EVENTS"]
            ?? "notification-service-loan-events-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation(
                "LoanEventsSubscriber: Listening on {Subscription}", subscriptionName);

            await subscriber.StartAsync(async (message, ct) =>
            {
                var messageId = message.MessageId;

                // In-process dedupe
                lock (_processedMessageIds)
                {
                    if (!_processedMessageIds.Add(messageId))
                    {
                        logger.LogDebug(
                            "LoanEventsSubscriber: Duplicate message_id={MessageId} — skipping", messageId);
                        return SubscriberClient.Reply.Ack;
                    }
                }

                try
                {
                    var json = message.Data.ToStringUtf8();
                    var payload = JsonSerializer.Deserialize<LoanEventPayload>(json, JsonOptions);

                    if (payload is null || string.IsNullOrEmpty(payload.EventType))
                    {
                        logger.LogWarning(
                            "LoanEventsSubscriber: Could not deserialize message {MessageId}: {Json}",
                            messageId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    logger.LogInformation(
                        "LoanEventsSubscriber: Received {EventType} for app {ApplicationId}",
                        payload.EventType, payload.ApplicationId);

                    await DispatchNotificationAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex,
                        "LoanEventsSubscriber: Processing failed for message_id={MessageId}", messageId);
                    lock (_processedMessageIds) { _processedMessageIds.Remove(messageId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "LoanEventsSubscriber: Failed to start subscriber for {Subscription}", subscriptionName);
        }
    }

    private async Task DispatchNotificationAsync(LoanEventPayload payload, CancellationToken ct)
    {
        // Map loan event type → notification event code (matches catalog)
        var eventCode = payload.EventType switch
        {
            "LoanDisbursed" => "LOAN_DISBURSED",
            "LoanDisbursementFailed" => "LOAN_DISBURSEMENT_FAILED",
            "LoanDisbursementReversed" => "LOAN_DISBURSEMENT_REVERSED",
            _ => null
        };

        if (eventCode is null)
        {
            logger.LogWarning(
                "LoanEventsSubscriber: Unknown event type '{EventType}' — no notification sent.",
                payload.EventType);
            return;
        }

        // Build template variables for the notification.
        // SEC-047: disbursedAmount is intentionally excluded from the Push (FCM) channel variables.
        // FCM push notification body appears on device lock screens (DPDP Act 2023 data minimisation).
        // The push template must use a generic message ("Your loan has been disbursed — open app
        // for details"). Amount is only safe for SMS/email channels where it is not lock-screen visible;
        // multi-channel variable override is a Phase 7 enhancement (tracked as P6-HANDOFF-35).
        var variables = new Dictionary<string, string>
        {
            ["applicationId"] = payload.ApplicationId.ToString(),
            ["orgId"] = payload.OrgId.ToString(),
            ["occurredAt"] = payload.OccurredAt?.ToString("dd MMM yyyy HH:mm") ?? ""
        };

        // Send notification to the organisation's primary user (OrgId → UserId resolution
        // is handled inside SendNotificationCommand via UserService lookup in Phase 7).
        // For Phase 6C: use OrgId as a placeholder — notification fan-out will be fully
        // wired when UserService integration is complete.
        var command = new SendNotificationCommand(
            UserId: payload.UserId ?? Guid.Empty,
            EventCode: eventCode,
            Locale: "en",
            Variables: variables.AsReadOnly());

        var result = await mediator.Send(command, ct);
        if (result.IsFailure)
            logger.LogWarning(
                "LoanEventsSubscriber: Notification dispatch failed for {EventCode}: {Error}",
                eventCode, result.Error.Message);
        else
            logger.LogInformation(
                "LoanEventsSubscriber: Dispatched {EventCode} for app {ApplicationId}. Count={Count}",
                eventCode, payload.ApplicationId, result.Value?.DispatchedCount ?? 0);
    }

    private sealed record LoanEventPayload(
        string EventType,
        Guid ApplicationId,
        Guid OrgId,
        Guid? UserId,
        decimal? DisbursedAmount,
        Guid? BankId,
        DateTime? OccurredAt);
}
