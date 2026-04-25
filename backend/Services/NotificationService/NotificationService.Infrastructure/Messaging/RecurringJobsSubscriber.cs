using Google.Cloud.PubSub.V1;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Notifications.Commands.SendNotification;
using System.Text.Json;

namespace NotificationService.Infrastructure.Messaging;

/// <summary>
/// Pub/Sub subscriber for Cloud Scheduler-dispatched recurring job messages.
/// Topic: snapaccount.recurring-jobs.due
/// Subscription: notification-service-recurring-jobs-sub
/// Supported job types: GST_DEADLINE_CHECK, ITR_DEADLINE_REMINDERS, ITR_REFUND_POLLING, SUBSCRIPTION_RENEWAL_CHECK.
/// Idempotency: messages are deduped by event_id in-process via HashSet (restarted on process recycle).
/// </summary>
public sealed class RecurringJobsSubscriber(
    IConfiguration configuration,
    IMediator mediator,
    ILogger<RecurringJobsSubscriber> logger) : BackgroundService
{
    private readonly HashSet<string> _processedEventIds = new(StringComparer.Ordinal);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"]
            ?? throw new InvalidOperationException("GCP_PROJECT_ID not configured.");
        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_RECURRING_JOBS"]
            ?? "notification-service-recurring-jobs-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        logger.LogInformation("RecurringJobsSubscriber listening on {Subscription}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            var eventId = message.MessageId;

            // In-process dedupe
            lock (_processedEventIds)
            {
                if (!_processedEventIds.Add(eventId))
                {
                    logger.LogDebug("RecurringJob duplicate event_id={EventId} — skipping", eventId);
                    return SubscriberClient.Reply.Ack;
                }
            }

            try
            {
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<RecurringJobPayload>(json, JsonOptions);
                if (payload is null)
                {
                    logger.LogWarning("RecurringJob message could not be deserialized: {Json}", json);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogInformation("RecurringJob received: job_type={JobType} event_id={EventId}",
                    payload.JobType, eventId);

                await DispatchJobAsync(payload, ct);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "RecurringJob processing failed: event_id={EventId}", eventId);
                // Remove from dedup set so it will be retried on redelivery
                lock (_processedEventIds) { _processedEventIds.Remove(eventId); }
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task DispatchJobAsync(RecurringJobPayload payload, CancellationToken ct)
    {
        // Map job type → notification event code. The SendNotificationCommand fan-out
        // pipeline resolves the actual user list and template per event code.
        // For recurring jobs, UserId is Guid.Empty (broadcast / scheduled sweep).
        var eventCode = payload.JobType switch
        {
            "GST_DEADLINE_CHECK" => "gst.deadline.reminder",
            "ITR_DEADLINE_REMINDERS" => "itr.deadline.reminder",
            "ITR_REFUND_POLLING" => "itr.refund.status.update",
            "SUBSCRIPTION_RENEWAL_CHECK" => "subscription.renewal.reminder",
            _ => null
        };

        if (eventCode is null)
        {
            logger.LogWarning("Unknown recurring job type: {JobType}", payload.JobType);
            return;
        }

        // Broadcast path: send a marker notification with a placeholder UserId.
        // The actual user resolution (e.g., all users with GST due) is handled
        // by the service-specific Application layer — this subscriber only triggers the pipeline.
        var variables = payload.Variables ?? new Dictionary<string, string>();

        var command = new SendNotificationCommand(
            UserId: payload.TargetUserId ?? Guid.Empty,
            EventCode: eventCode,
            Locale: "en",
            Variables: variables.AsReadOnly());

        var result = await mediator.Send(command, ct);
        if (result.IsFailure)
            logger.LogWarning("RecurringJob notification dispatch failed: {Error}", result.Error.Message);
        else
            logger.LogInformation("RecurringJob dispatch complete: job_type={JobType} dispatched={Count}",
                payload.JobType, result.Value?.DispatchedCount ?? 0);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record RecurringJobPayload(
        string JobType,
        Guid? TargetUserId,
        Dictionary<string, string>? Variables);
}
