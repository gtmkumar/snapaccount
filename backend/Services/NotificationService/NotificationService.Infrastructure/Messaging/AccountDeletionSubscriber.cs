using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using System.Text.Json;

namespace NotificationService.Infrastructure.Messaging;

/// <summary>
/// SEC-027: DPDP Act 2023 Right-to-Erasure subscriber for NotificationService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic.
/// On receipt:
///   - Soft-deletes <c>notification.notification_log</c> rows for the deleted user.
///   - Soft-deletes <c>notification.dlq_items</c> rows for the deleted user.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string Subscription = "notification-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "SEC-027: GCP_PROJECT_ID not configured — AccountDeletionSubscriber will not start. " +
                "DPDP erasure for NotificationService is disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_NOTIFICATION"] ?? Subscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "SEC-027: Failed to create Pub/Sub subscriber for {Subscription}. " +
                "DPDP erasure for NotificationService is disabled.", subscriptionName);
            return;
        }

        logger.LogInformation(
            "SEC-027: AccountDeletionSubscriber listening on {Subscription}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            var messageId = message.MessageId;
            try
            {
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<AccountDeletionPayload>(json, JsonOptions);

                if (payload is null || payload.UserId == Guid.Empty)
                {
                    logger.LogWarning(
                        "SEC-027: Received malformed deletion event message_id={MessageId} — acking to avoid redelivery loop.",
                        messageId);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogInformation(
                    "SEC-027: Processing DPDP erasure for user_id={UserId} message_id={MessageId}",
                    payload.UserId, messageId);

                await EraseUserDataAsync(payload.UserId, ct);

                logger.LogInformation(
                    "SEC-027: DPDP erasure complete for user_id={UserId}", payload.UserId);

                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "SEC-027: DPDP erasure failed for message_id={MessageId} — will nack for retry.", messageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    /// <summary>
    /// Soft-deletes notification_log and dlq_items for the given user within a scoped DI lifetime.
    /// </summary>
    private async Task EraseUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<INotificationDbContext>();

        var now = DateTime.UtcNow;

        // 1. Soft-delete notification_log rows for this user.
        var logs = await db.NotificationLog
            .Where(n => n.UserId == userId && n.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var log in logs)
        {
            log.DeletedAt = now;
        }

        // 2. Soft-delete dlq_items rows for this user.
        var dlqItems = await db.DlqItems
            .Where(d => d.UserId == userId && d.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var item in dlqItems)
        {
            item.DeletedAt = now;
        }

        await db.SaveChangesAsync(ct);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record AccountDeletionPayload(Guid UserId);
}
