using CallbackService.Application.Common.Interfaces;
using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace CallbackService.Infrastructure.Messaging;

/// <summary>
/// SEC-027: DPDP Act 2023 Right-to-Erasure subscriber for CallbackService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic.
/// On receipt:
///   - Soft-deletes <c>callback.call_notes</c> authored by the deleted user.
///   - Anonymizes <c>callback.callbacks</c> rows owned by the deleted user:
///     sets <c>user_id = NULL</c>, <c>anonymized_at = NOW()</c>,
///     <c>anonymization_reason = 'DPDP_ORG_ERASURE'</c>.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string Subscription = "callback-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "SEC-027: GCP_PROJECT_ID not configured — AccountDeletionSubscriber will not start. " +
                "DPDP erasure for CallbackService is disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_CALLBACK"] ?? Subscription;
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
                "DPDP erasure for CallbackService is disabled.", subscriptionName);
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
    /// Executes the erasure within a DI scope (DbContext is scoped).
    /// </summary>
    private async Task EraseUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ICallbackDbContext>();

        var now = DateTime.UtcNow;

        // 1. Soft-delete call_notes authored by the deleted user.
        //    Load and set DeletedAt — avoids raw SQL per project conventions.
        var notes = await db.CallNotes
            .Where(n => n.AuthorId == userId && n.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var note in notes)
        {
            note.DeletedAt = now;
        }

        // 2. Anonymize callbacks belonging to the deleted user.
        //    Calls domain method which sets user_id=null, anonymized_at, anonymization_reason.
        var callbacks = await db.Callbacks
            .Where(c => c.UserId == userId && c.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var cb in callbacks)
        {
            cb.Anonymize("DPDP_ORG_ERASURE");
        }

        await db.SaveChangesAsync(ct);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record AccountDeletionPayload(Guid UserId);
}
