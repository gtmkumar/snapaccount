using Google.Cloud.PubSub.V1;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Notifications.Commands.SendNotification;
using NotificationService.Infrastructure.Persistence;
using System.Text.Json;

namespace NotificationService.Infrastructure.Messaging;

/// <summary>
/// DG-NOTIF-01: Pub/Sub subscriber for GST deadline-approaching events published by FinanceService.
/// Topic: snapaccount.gst.deadline-approaching
/// Subscription: notification-service-gst-deadline-sub
///
/// Maps <see cref="GstDeadlinePayload.DaysUntilDue"/> to catalog event codes:
///   D-7 → GST_DEADLINE_7_DAYS
///   D-3 → GST_DEADLINE_3_DAYS
///   D-1 → GST_DEADLINE_1_DAY
///   D+1 → GST_DEADLINE_1_DAY (overdue, same template with different variables)
///
/// Resolves the org's member user IDs from <c>auth.org_member</c> via a scoped
/// NotificationServiceDbContext projection on the shared Postgres DB, then
/// dispatches one <see cref="SendNotificationCommand"/> per user.
/// </summary>
public sealed class GstDeadlineEventsSubscriber(
    IConfiguration configuration,
    IServiceProvider services,
    ILogger<GstDeadlineEventsSubscriber> logger) : BackgroundService
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
                "GstDeadlineEventsSubscriber: GCP_PROJECT_ID not configured — GST deadline notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_GST_DEADLINE"]
            ?? "notification-service-gst-deadline-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation("GstDeadlineEventsSubscriber: Listening on {Subscription}", subscriptionName);

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
                    var payload = JsonSerializer.Deserialize<GstDeadlinePayload>(json, JsonOptions);
                    if (payload is null)
                    {
                        logger.LogWarning("GstDeadlineEventsSubscriber: unreadable message {MsgId}: {Json}", msgId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    await DispatchToOrgMembersAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "GstDeadlineEventsSubscriber: failed for message {MsgId}", msgId);
                    lock (_processedIds) { _processedIds.Remove(msgId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "GstDeadlineEventsSubscriber: could not start subscriber.");
        }
    }

    private async Task DispatchToOrgMembersAsync(GstDeadlinePayload payload, CancellationToken ct)
    {
        // Map DaysUntilDue → catalog event code
        var eventCode = payload.DaysUntilDue switch
        {
            7 => "GST_DEADLINE_7_DAYS",
            3 => "GST_DEADLINE_3_DAYS",
            1 or <= 0 => "GST_DEADLINE_1_DAY",  // D-1 and overdue share same template
            _ => null
        };

        if (eventCode is null)
        {
            logger.LogDebug("GstDeadlineEventsSubscriber: no event code for DaysUntilDue={Days}", payload.DaysUntilDue);
            return;
        }

        var variables = new Dictionary<string, string>
        {
            ["returnType"] = payload.ReturnType ?? "GSTR",
            ["dueDate"]    = payload.DueDate,
            ["orgId"]      = payload.OrganizationId.ToString(),
            ["daysLeft"]   = payload.DaysUntilDue.ToString()
        };

        // Resolve org member user IDs from auth schema
        var userIds = await ResolveOrgMembersAsync(payload.OrganizationId, ct);
        if (userIds.Count == 0)
        {
            logger.LogWarning(
                "GstDeadlineEventsSubscriber: no members found for org {OrgId}; skipping notification.",
                payload.OrganizationId);
            return;
        }

        using var scope = services.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        foreach (var userId in userIds)
        {
            var command = new SendNotificationCommand(
                UserId: userId,
                EventCode: eventCode,
                Locale: "en",
                Variables: variables.AsReadOnly());

            var result = await mediator.Send(command, ct);
            if (result.IsFailure)
                logger.LogWarning(
                    "GstDeadlineEventsSubscriber: dispatch failed for user {UserId}: {Error}",
                    userId, result.Error.Message);
            else
                logger.LogInformation(
                    "GstDeadlineEventsSubscriber: dispatched {EventCode} to user {UserId} (org {OrgId})",
                    eventCode, userId, payload.OrganizationId);
        }
    }

    /// <summary>
    /// Reads org members from <c>auth.org_member</c> via raw SQL on the shared Postgres DB.
    /// Uses a short-lived scope to avoid holding a DbContext open during long Pub/Sub waits.
    /// Falls back to empty list on any error so the calling handler can Ack the message.
    /// </summary>
    private async Task<IReadOnlyList<Guid>> ResolveOrgMembersAsync(Guid orgId, CancellationToken ct)
    {
        try
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NotificationServiceDbContext>();

            // auth.org_member is in the shared DB. We query it via raw SQL to avoid
            // a cross-schema EF dependency in the Notification layer.
            var userIds = await db.Database
                .SqlQueryRaw<Guid>(
                    "SELECT user_id FROM auth.org_member WHERE organization_id = {0} AND deleted_at IS NULL",
                    orgId)
                .ToListAsync(ct);

            return userIds;
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "GstDeadlineEventsSubscriber: failed to resolve org members for org {OrgId}", orgId);
            return [];
        }
    }

    private sealed record GstDeadlinePayload(
        Guid GstReturnId,
        Guid OrganizationId,
        string ReturnType,
        string DueDate,
        int DaysUntilDue,
        string? Priority);
}
