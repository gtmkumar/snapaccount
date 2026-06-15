using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ChatService.Infrastructure.Persistence;
using System.Text.Json;

namespace ChatService.Infrastructure.Messaging;

/// <summary>
/// DPDP Act 2023 / SEC-027: Right-to-Erasure subscriber for ChatService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic.
/// On receipt:
///   - Anonymizes <c>chat.messages.sender_user_id</c> (NULL + anonymized_at + reason='DPDP_USER_ERASURE').
///   - Soft-deletes <c>chat.thread_participants</c> rows for the deleted user.
/// DB triggers block hard-delete — only anonymize/soft-delete allowed.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "chat-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "DPDP: GCP_PROJECT_ID not configured — AccountDeletionSubscriber (ChatService) will not start.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_CHAT"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "DPDP: Failed to create Pub/Sub subscriber {Subscription}. ChatService erasure disabled.",
                subscriptionName);
            return;
        }

        logger.LogInformation("DPDP: AccountDeletionSubscriber (ChatService) listening on {Sub}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            try
            {
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<AccountDeletionPayload>(json, JsonOptions);

                if (payload is null || payload.UserId == Guid.Empty)
                {
                    logger.LogWarning("DPDP: Malformed deletion event message_id={Id} — acking.", message.MessageId);
                    return SubscriberClient.Reply.Ack;
                }

                await EraseUserDataAsync(payload.UserId, ct);
                logger.LogInformation("DPDP: Erasure complete for user_id={UserId}", payload.UserId);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "DPDP: Erasure failed for message_id={Id}", message.MessageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task EraseUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ChatServiceDbContext>();

        // Anonymize messages sent by this user
        var messages = await db.Messages
            .IgnoreQueryFilters()
            .Where(m => m.SenderUserId == userId)
            .ToListAsync(ct);

        foreach (var msg in messages)
            msg.AnonymizeSender("DPDP_USER_ERASURE");

        // Soft-delete thread participant records
        var participants = await db.ThreadParticipants
            .IgnoreQueryFilters()
            .Where(p => p.UserId == userId && p.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var p in participants)
            p.SoftDelete();

        if (messages.Count > 0 || participants.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "DPDP: Anonymized {MsgCount} messages and soft-deleted {ParticipantCount} participant records for user {UserId}.",
                messages.Count, participants.Count, userId);
        }
    }

    private sealed record AccountDeletionPayload(Guid UserId, string? Reason);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };
}
