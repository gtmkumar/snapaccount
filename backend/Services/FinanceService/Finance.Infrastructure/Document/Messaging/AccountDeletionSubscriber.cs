using DocumentService.Application.Common.Interfaces;
using DocumentService.Domain.Entities;
using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace DocumentService.Infrastructure.Messaging;

/// <summary>
/// DG-SEC-03 / SEC-007 / DPDP Act 2023 Right-to-Erasure subscriber for DocumentService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic (subscription:
/// <c>document-service-account-deletion-sub</c>).
///
/// Erasure policy (anonymise-only — do NOT hard-delete rows):
///   <list type="bullet">
///     <item><see cref="Document.UserId"/> → NULL (RLS then hides the row from any tenant)</item>
///     <item><see cref="Document.OriginalFileName"/> → NULL (removes user-visible filename PII)</item>
///     <item><see cref="Document.AnonymizedAt"/> → UTC now</item>
///     <item><see cref="Document.AnonymizationReason"/> → 'DPDP_USER_ERASURE'</item>
///   </list>
///
/// NOTE: <see cref="Document.StoragePath"/> and the underlying GCS blob are NOT cleared here.
/// A separate GCS lifecycle rule (7-year retention, then auto-delete) governs blobs.
/// If immediate blob deletion is required, extend this subscriber to call
/// <see cref="DocumentService.Application.Documents.Interfaces.IDocumentStorageService.DeleteAsync"/>
/// (TL-gated — blobs may be needed for 7-year regulatory document retention).
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "document-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "AccountDeletionSubscriber [Document]: GCP_PROJECT_ID not configured. " +
                "DPDP erasure for DocumentService is disabled — DG-SEC-03.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_DOCUMENT"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "AccountDeletionSubscriber [Document]: Failed to create subscriber for {Subscription}. " +
                "DPDP erasure disabled until Pub/Sub subscription is provisioned (DG-INFRA-02).",
                subscriptionName);
            return;
        }

        logger.LogInformation(
            "AccountDeletionSubscriber [Document]: listening on {Subscription}", subscriptionName);

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
                        "AccountDeletionSubscriber [Document]: Malformed message {MessageId} — acking.", messageId);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogInformation(
                    "AccountDeletionSubscriber [Document]: DPDP erasure for user_id={UserId} message_id={MsgId}",
                    payload.UserId, messageId);

                await AnonymiseUserDataAsync(payload.UserId, ct);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "AccountDeletionSubscriber [Document]: Erasure failed for message_id={MessageId} — nacking.",
                    messageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task AnonymiseUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDocumentDbContext>();

        var now = DateTime.UtcNow;
        const string reason = "DPDP_USER_ERASURE";

        // Load all non-yet-anonymised documents belonging to this user.
        var documents = await db.Documents
            .Where(d => d.UserId == userId && d.AnonymizedAt == null)
            .ToListAsync(ct);

        foreach (var doc in documents)
        {
            // DG-SEC-03: NULL user_id (RLS then hides this row from all tenants)
            doc.UserId = null;
            // Clear original filename — the only user-visible PII on the row itself.
            // StoragePath is a UUID-based GCS key with no personal data embedded.
            doc.OriginalFileName = null;
            // Stamp erasure audit fields
            doc.AnonymizedAt = now;
            doc.AnonymizationReason = reason;
        }

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "AccountDeletionSubscriber [Document]: Anonymised {Count} document(s) for user_id={UserId}",
            documents.Count, userId);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record AccountDeletionPayload(Guid UserId, string? EventId = null);
}
