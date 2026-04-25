using Google.Cloud.PubSub.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace GstService.Infrastructure.Messaging;

/// <summary>
/// Pub/Sub subscriber for Cloud Scheduler-dispatched recurring job messages.
/// Topic: snapaccount.recurring-jobs.due
/// Subscription: gst-service-recurring-jobs-sub
/// Supported job type: gst_deadline_check
/// Phase 6B: emits GstDeadlineApproachingEvent at D-7, D-3, D-1 and D+1 (HIGH).
/// </summary>
public sealed class GstRecurringJobsSubscriber(
    IConfiguration configuration,
    IServiceProvider serviceProvider,
    ILogger<GstRecurringJobsSubscriber> logger) : BackgroundService
{
    private readonly HashSet<string> _processedEventIds = new(StringComparer.Ordinal);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"]
            ?? throw new InvalidOperationException("GCP_PROJECT_ID not configured.");
        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_RECURRING_JOBS_GST"]
            ?? "gst-service-recurring-jobs-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "GstRecurringJobsSubscriber: could not connect to Pub/Sub subscription {Sub} — " +
                "deadline reminders disabled (running in local/mock mode)", subscriptionName);
            return;
        }

        logger.LogInformation("GstRecurringJobsSubscriber listening on {Subscription}", subscriptionName);

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
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<RecurringJobPayload>(json, JsonOptions);

                if (payload?.JobType != "gst_deadline_check")
                    return SubscriberClient.Reply.Ack;

                logger.LogInformation("GstRecurringJobsSubscriber: gst_deadline_check received");
                await using var scope = serviceProvider.CreateAsyncScope();
                var handler = scope.ServiceProvider.GetRequiredService<IGstDeadlineCheckHandler>();
                await handler.RunAsync(ct);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "GstRecurringJobsSubscriber: processing failed event_id={EventId}", eventId);
                lock (_processedEventIds) { _processedEventIds.Remove(eventId); }
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record RecurringJobPayload(string JobType, Guid? TargetOrgId);
}

/// <summary>Scoped handler for the GST deadline check job.</summary>
public interface IGstDeadlineCheckHandler
{
    Task RunAsync(CancellationToken ct);
}
