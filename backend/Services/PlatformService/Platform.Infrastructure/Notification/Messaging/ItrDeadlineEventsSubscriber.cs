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
/// DG-NOTIF-01: Pub/Sub subscriber for ITR deadline reminder events published by FinanceService.
/// Topic: itr-deadline-reminders
/// Subscription: notification-service-itr-deadline-sub
///
/// Maps <see cref="ItrDeadlinePayload.DaysUntilDue"/> to catalog event codes:
///   7 → ITR_EFILE_VERIFY_D7
///   3 → ITR_EFILE_VERIFY_D7  (no D-3 in catalog; closest is D7/D1/D15/D25/D29)
///   1 → ITR_EFILE_VERIFY_D1
///  -1 (overdue) → ITR_EFILE_VERIFY_D1
///
/// The payload carries the AssesseeId (== UserId in the ITR module).
/// </summary>
public sealed class ItrDeadlineEventsSubscriber(
    IConfiguration configuration,
    IServiceProvider services,
    ILogger<ItrDeadlineEventsSubscriber> logger) : BackgroundService
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
                "ItrDeadlineEventsSubscriber: GCP_PROJECT_ID not configured — ITR deadline notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ITR_DEADLINE"]
            ?? "notification-service-itr-deadline-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation("ItrDeadlineEventsSubscriber: Listening on {Subscription}", subscriptionName);

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
                    var payload = JsonSerializer.Deserialize<ItrDeadlinePayload>(json, JsonOptions);
                    if (payload is null)
                    {
                        logger.LogWarning("ItrDeadlineEventsSubscriber: unreadable message {MsgId}: {Json}", msgId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    await DispatchAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "ItrDeadlineEventsSubscriber: failed for message {MsgId}", msgId);
                    lock (_processedIds) { _processedIds.Remove(msgId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ItrDeadlineEventsSubscriber: could not start subscriber.");
        }
    }

    private async Task DispatchAsync(ItrDeadlinePayload payload, CancellationToken ct)
    {
        // Map DaysUntilDue → nearest catalog event code for ITR e-verify reminders
        var eventCode = payload.DaysUntilDue switch
        {
            >= 25 => "ITR_EFILE_VERIFY_D29",
            >= 15 => "ITR_EFILE_VERIFY_D25",
            >= 7  => "ITR_EFILE_VERIFY_D15",
            >= 2  => "ITR_EFILE_VERIFY_D7",
            _     => "ITR_EFILE_VERIFY_D1"   // D-1 and overdue
        };

        var variables = new Dictionary<string, string>
        {
            ["assessmentYear"] = payload.AssessmentYear ?? "",
            ["daysLeft"]       = payload.DaysUntilDue.ToString(),
            ["isWeeklyDigest"] = payload.IsWeeklyDigest.ToString().ToLower()
        };

        using var scope = services.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        // AssesseeId == UserId in the ITR module (the person who owns the filing)
        var command = new SendNotificationCommand(
            UserId: payload.AssesseeId,
            EventCode: eventCode,
            Locale: "en",
            Variables: variables.AsReadOnly());

        var result = await mediator.Send(command, ct);
        if (result.IsFailure)
            logger.LogWarning(
                "ItrDeadlineEventsSubscriber: dispatch failed for assessee {AssesseeId}: {Error}",
                payload.AssesseeId, result.Error.Message);
        else
            logger.LogInformation(
                "ItrDeadlineEventsSubscriber: dispatched {EventCode} to assessee {AssesseeId}",
                eventCode, payload.AssesseeId);
    }

    private sealed record ItrDeadlinePayload(
        Guid AssesseeId,
        string AssessmentYear,
        int DaysUntilDue,
        bool IsWeeklyDigest);
}
