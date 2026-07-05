using Google.Cloud.PubSub.V1;
using MediatR;
using Microsoft.Extensions.Caching.Distributed;
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
///
/// SEC-031: Idempotency keyed on Pub/Sub MessageId via Redis (IDistributedCache)
/// with 24h TTL. Replaces the prior in-process HashSet which would duplicate
/// dispatch on multi-pod scale-out and forget on restart.
/// </summary>
public sealed class RecurringJobsSubscriber(
    IConfiguration configuration,
    IMediator mediator,
    IDistributedCache cache,
    ILogger<RecurringJobsSubscriber> logger) : BackgroundService
{
    private static readonly TimeSpan DedupTtl = TimeSpan.FromHours(24);
    private const string CachePrefix = "notification:recurring-jobs:dedup:";

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
            var cacheKey = CachePrefix + eventId;

            // SEC-031: distributed dedupe via Redis. GetString returns non-null when
            // we've seen this MessageId before (within TTL).
            var existing = await cache.GetStringAsync(cacheKey, ct);
            if (existing is not null)
            {
                logger.LogDebug("RecurringJob duplicate event_id={EventId} — skipping (cache hit)", eventId);
                return SubscriberClient.Reply.Ack;
            }

            // Mark as in-flight FIRST so concurrent pods don't double-process.
            // Failure-path below evicts the key so Pub/Sub redelivery can retry.
            await cache.SetStringAsync(cacheKey, "1",
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = DedupTtl }, ct);

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
                // Evict so Pub/Sub redelivery is processed by some pod.
                try { await cache.RemoveAsync(cacheKey, ct); }
                catch (Exception evictEx)
                {
                    logger.LogWarning(evictEx,
                        "RecurringJob dedupe-key eviction failed: event_id={EventId}", eventId);
                }
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task DispatchJobAsync(RecurringJobPayload payload, CancellationToken ct)
    {
        // Map job type → notification event code (must match NotificationEventCatalog uppercase codes).
        // DG-NOTIF-03: prior mapping used dotted-lowercase codes that matched nothing in the catalog.
        //
        // DG-GST-03 / DG-ITR-03 FIX: sweep-only job types (GST_DEADLINE_CHECK,
        // ITR_DEADLINE_REMINDERS) are handled by dedicated module-specific Pub/Sub subscribers
        // (GstDeadlineEventsSubscriber, ItrDeadlineEventsSubscriber) that resolve real member
        // UserIds from auth.org_member.  Attempting to dispatch here with Guid.Empty fails
        // SendNotificationCommandValidator (UserId.NotEmpty rule) and produces no notifications.
        // These job types are therefore acknowledged without attempting a direct dispatch.
        // Only job types that carry a real TargetUserId (ITR_REFUND_POLLING, SUBSCRIPTION_RENEWAL_CHECK)
        // are dispatched via SendNotificationCommand from this subscriber.
        var sweepOnlyJobTypes = new HashSet<string>(StringComparer.Ordinal)
        {
            "GST_DEADLINE_CHECK",    // handled by GstDeadlineEventsSubscriber
            "ITR_DEADLINE_REMINDERS" // handled by ItrDeadlineEventsSubscriber
        };

        if (sweepOnlyJobTypes.Contains(payload.JobType))
        {
            logger.LogInformation(
                "RecurringJob {JobType}: sweep-only job — per-user dispatch is handled by " +
                "the dedicated module Pub/Sub subscriber. Acknowledging without local dispatch.",
                payload.JobType);
            return;
        }

        var eventCode = payload.JobType switch
        {
            "ITR_REFUND_POLLING" => "ITR_REFUND_CREDITED",
            "SUBSCRIPTION_RENEWAL_CHECK" => "SUB_RENEWAL_3_DAYS",
            _ => null
        };

        if (eventCode is null)
        {
            logger.LogWarning("Unknown recurring job type: {JobType}", payload.JobType);
            return;
        }

        // For job types that DO carry a TargetUserId, dispatch the notification directly.
        var targetUserId = payload.TargetUserId;
        if (!targetUserId.HasValue || targetUserId.Value == Guid.Empty)
        {
            logger.LogWarning(
                "RecurringJob {JobType}: no TargetUserId — skipping dispatch (event requires a real user ID).",
                payload.JobType);
            return;
        }

        var variables = payload.Variables ?? new Dictionary<string, string>();

        var command = new SendNotificationCommand(
            UserId: targetUserId.Value,
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
