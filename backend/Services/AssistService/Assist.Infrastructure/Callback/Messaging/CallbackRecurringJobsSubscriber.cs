using CallbackService.Infrastructure.Persistence;
using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace CallbackService.Infrastructure.Messaging;

/// <summary>
/// DG-INFRA-04: Pub/Sub subscriber for Cloud Scheduler-dispatched recurring job messages.
/// Topic: snapaccount.recurring-jobs.due
/// Subscription: callback-service-recurring-jobs-sub
/// Supported job types:
///   - CALLBACK_KPI_MV_REFRESH  — runs REFRESH MATERIALIZED VIEW CONCURRENTLY on callback.kpi_daily_snapshot
///   - GST_PRE_DEADLINE_CALLBACK — auto-creates a callback when a GST return is unapproved ≤2 days before deadline
/// </summary>
public sealed class CallbackRecurringJobsSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<CallbackRecurringJobsSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "callback-service-recurring-jobs-sub";

    // In-process dedup: sufficient for single-pod; for multi-pod use Redis (see NotificationService RecurringJobsSubscriber pattern).
    private readonly HashSet<string> _processedEventIds = new(StringComparer.Ordinal);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "DG-INFRA-04: GCP_PROJECT_ID not configured — CallbackRecurringJobsSubscriber will not start. " +
                "KPI MV refreshes and proactive callbacks are disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_RECURRING_JOBS_CALLBACK"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "DG-INFRA-04: Failed to connect to Pub/Sub subscription {Subscription} — " +
                "KPI MV refresh and proactive callbacks disabled (running in local/mock mode).",
                subscriptionName);
            return;
        }

        logger.LogInformation(
            "DG-INFRA-04: CallbackRecurringJobsSubscriber listening on {Subscription}", subscriptionName);

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

                if (payload is null)
                {
                    logger.LogWarning(
                        "DG-INFRA-04: Could not deserialize Pub/Sub message {EventId}: {Json}",
                        eventId, json);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogInformation(
                    "DG-INFRA-04: Received job_type={JobType} event_id={EventId}",
                    payload.JobType, eventId);

                await DispatchJobAsync(payload, ct);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "DG-INFRA-04: Processing failed for event_id={EventId} — nacking for retry.",
                    eventId);
                lock (_processedEventIds) { _processedEventIds.Remove(eventId); }
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task DispatchJobAsync(RecurringJobPayload payload, CancellationToken ct)
    {
        switch (payload.JobType)
        {
            case "CALLBACK_KPI_MV_REFRESH":
                await RefreshKpiMvAsync(ct);
                break;

            case "GST_PRE_DEADLINE_CALLBACK":
                // PENDING-B19: full GST pre-deadline callback auto-creation requires
                // querying the Finance schema (gst.gst_return) across service boundaries.
                // Acknowledged here without action; the POST /callbacks/internal/gst-pre-deadline
                // endpoint exists for Cloud Scheduler to call directly when this is implemented.
                logger.LogInformation(
                    "DG-INFRA-04: GST_PRE_DEADLINE_CALLBACK received — auto-callback creation " +
                    "is PENDING-B19 and not yet implemented. Acknowledging without action.");
                break;

            default:
                logger.LogDebug(
                    "DG-INFRA-04: Unknown job_type={JobType} — acknowledging without action.",
                    payload.JobType);
                break;
        }
    }

    /// <summary>
    /// Executes REFRESH MATERIALIZED VIEW CONCURRENTLY on <c>callback.kpi_daily_snapshot</c>.
    /// The CONCURRENTLY keyword requires the unique index <c>uq_kpi_daily_snapshot_org_date</c>
    /// which is asserted by migrations 067 and 073.
    /// </summary>
    private async Task RefreshKpiMvAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CallbackDbContext>();

        logger.LogInformation(
            "DG-INFRA-04: Running REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot");

        await db.Database.ExecuteSqlRawAsync(
            "REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;", ct);

        logger.LogInformation(
            "DG-INFRA-04: REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot completed.");
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record RecurringJobPayload(string JobType, string? Source, string? Mv, int? DaysBeforeDeadline);
}
