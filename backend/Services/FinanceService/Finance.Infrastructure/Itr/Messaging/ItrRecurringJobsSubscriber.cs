using Google.Cloud.PubSub.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace ItrService.Infrastructure.Messaging;

/// <summary>
/// Pub/Sub subscriber for Cloud Scheduler-dispatched recurring job messages.
/// Topic: snapaccount.recurring-jobs.due
/// Subscription: itr-service-recurring-jobs-sub
/// Supported job types:
///   - itr_deadline_reminders: seasonal gating — full cascade May-Sep, weekly digest otherwise
///   - itr_refund_polling: poll refund status (mock for MVP)
/// Phase 6D.
/// </summary>
public sealed class ItrRecurringJobsSubscriber(
    IConfiguration configuration,
    IServiceProvider serviceProvider,
    ILogger<ItrRecurringJobsSubscriber> logger) : BackgroundService
{
    private readonly HashSet<string> _processedEventIds = new(StringComparer.Ordinal);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"]
            ?? throw new InvalidOperationException("GCP_PROJECT_ID not configured.");
        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_RECURRING_JOBS_ITR"]
            ?? "itr-service-recurring-jobs-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ItrRecurringJobsSubscriber: could not connect to {Sub} — running in mock mode", subscriptionName);
            return;
        }

        logger.LogInformation("ItrRecurringJobsSubscriber listening on {Subscription}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            var eventId = message.MessageId;
            lock (_processedEventIds) { if (!_processedEventIds.Add(eventId)) return SubscriberClient.Reply.Ack; }

            try
            {
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<RecurringJobPayload>(json, JsonOptions);
                if (payload is null) return SubscriberClient.Reply.Ack;

                await using var scope = serviceProvider.CreateAsyncScope();

                switch (payload.JobType)
                {
                    case "itr_deadline_reminders":
                        var deadlineHandler = scope.ServiceProvider.GetRequiredService<IItrDeadlineReminderHandler>();
                        await deadlineHandler.RunAsync(ct);
                        break;
                    case "itr_refund_polling":
                        var refundHandler = scope.ServiceProvider.GetRequiredService<IItrRefundPollingHandler>();
                        await refundHandler.RunAsync(ct);
                        break;
                    default:
                        logger.LogDebug("ItrRecurringJobsSubscriber: ignoring job_type={JobType}", payload.JobType);
                        break;
                }

                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "ItrRecurringJobsSubscriber: failed event_id={EventId}", eventId);
                lock (_processedEventIds) { _processedEventIds.Remove(eventId); }
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private sealed record RecurringJobPayload(string JobType, Guid? TargetUserId);
}

/// <summary>Scoped handler for ITR deadline reminder job.</summary>
public interface IItrDeadlineReminderHandler { Task RunAsync(CancellationToken ct); }

/// <summary>Scoped handler for ITR refund polling job.</summary>
public interface IItrRefundPollingHandler { Task RunAsync(CancellationToken ct); }
