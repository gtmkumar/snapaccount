using Google.Cloud.PubSub.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace SnapAccount.Shared.Infrastructure.Messaging;

/// <summary>
/// GAP-113: Pub/Sub subscriber for the monthly PARTITION_MAINTENANCE recurring job dispatched
/// by Cloud Scheduler (topic <c>snapaccount.recurring-jobs.due</c>, payload
/// <c>job_type = "PARTITION_MAINTENANCE"</c>).
///
/// Each composite registers this with its OWN subscription id and an
/// <see cref="IPartitionMaintenanceHandler"/> that maintains the table(s) it owns
/// (Finance → <c>document.document</c>, Platform → <c>notification.notification</c>). Pub/Sub
/// delivers a copy of every message to each subscription, so the composites run independently.
/// Messages with any other job_type are ack'd and ignored. Gracefully no-ops when GCP/Pub-Sub
/// is unavailable (local dev), matching the other recurring-job subscribers.
/// </summary>
public sealed class PartitionMaintenanceSubscriber(
    IServiceProvider serviceProvider,
    IConfiguration configuration,
    ILogger<PartitionMaintenanceSubscriber> logger,
    string defaultSubscriptionId) : BackgroundService
{
    private const string JobType = "PARTITION_MAINTENANCE";
    private readonly HashSet<string> _processedEventIds = new(StringComparer.Ordinal);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning("PartitionMaintenanceSubscriber: GCP_PROJECT_ID not configured — disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_PARTITION_MAINTENANCE"] ?? defaultSubscriptionId;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "PartitionMaintenanceSubscriber: could not connect to {Sub} — partition maintenance disabled " +
                "(running in local/mock mode)", subscriptionName);
            return;
        }

        logger.LogInformation("PartitionMaintenanceSubscriber listening on {Subscription}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            var eventId = message.MessageId;
            lock (_processedEventIds)
            {
                if (!_processedEventIds.Add(eventId))
                    return SubscriberClient.Reply.Ack;
            }

            try
            {
                var payload = JsonSerializer.Deserialize<JobPayload>(message.Data.ToStringUtf8(), JsonOptions);
                if (payload?.JobType != JobType)
                    return SubscriberClient.Reply.Ack; // not our job — ack and ignore

                logger.LogInformation("PartitionMaintenanceSubscriber: {JobType} received (event_id={EventId})",
                    JobType, eventId);

                await using var scope = serviceProvider.CreateAsyncScope();
                var handler = scope.ServiceProvider.GetRequiredService<IPartitionMaintenanceHandler>();
                await handler.RunAsync(ct);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "PartitionMaintenanceSubscriber: processing failed event_id={EventId}", eventId);
                lock (_processedEventIds) { _processedEventIds.Remove(eventId); }
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private sealed record JobPayload(string JobType);
}
