using Google.Cloud.PubSub.V1;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Storage;
using System.Text.Json;

namespace GstService.Infrastructure.Messaging;

/// <summary>
/// SEC-040: DPDP Act 2023 Right-to-Erasure subscriber for GstService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic.
/// On receipt:
///   - Soft-deletes <c>gst.gst_invoices</c> rows where <c>created_by = userId.ToString()</c>.
///   - Soft-deletes <c>gst.gst_notices</c> rows whose <c>created_by</c> matches the deleted user.
///   - Deletes GCS notice attachment objects for the user's notices (P6-HANDOFF-14).
///   - Anonymizes org-shared notices: nulls <c>responded_by</c> if it matches the deleted user.
///   - Soft-deletes <c>gst.e_invoices</c> and <c>gst.e_way_bills</c> tied to the user's invoices.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "gst-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "SEC-040: GCP_PROJECT_ID not configured — GstService AccountDeletionSubscriber will not start. " +
                "DPDP erasure for GstService is disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_GST"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "SEC-040: Failed to create Pub/Sub subscriber for {Subscription}. " +
                "DPDP erasure for GstService is disabled.", subscriptionName);
            return;
        }

        logger.LogInformation(
            "SEC-040: GstService AccountDeletionSubscriber listening on {Subscription}", subscriptionName);

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
                        "SEC-040: Received malformed deletion event message_id={MessageId} — acking to avoid redelivery loop.",
                        messageId);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogInformation(
                    "SEC-040: Processing DPDP erasure for user_id={UserId} message_id={MessageId}",
                    payload.UserId, messageId);

                await EraseUserDataAsync(payload.UserId, ct);

                logger.LogInformation(
                    "SEC-040: DPDP erasure complete for user_id={UserId}", payload.UserId);

                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "SEC-040: DPDP erasure failed for message_id={MessageId} — will nack for retry.", messageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    /// <summary>
    /// Executes all erasure operations within a DI scope (DbContext is scoped).
    /// </summary>
    private async Task EraseUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IGstDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<ICloudStorageService>();

        var now = DateTime.UtcNow;
        // BaseAuditableEntity.CreatedBy stores Firebase UID as a string
        var userIdString = userId.ToString();

        // 1. Soft-delete gst_invoices authored by the deleted user.
        var invoices = await db.GstInvoices
            .Where(i => i.CreatedBy == userIdString && i.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var invoice in invoices)
        {
            invoice.DeletedAt = now;
        }

        // 2. Soft-delete gst_notices authored by the deleted user;
        //    also delete their GCS attachment objects (P6-HANDOFF-14).
        var ownedNotices = await db.GstNotices
            .Where(n => n.CreatedBy == userIdString && n.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var notice in ownedNotices)
        {
            await DeleteAttachmentsFromGcsAsync(notice.AttachmentsJson, storage, userId, ct);
            await DeleteAttachmentsFromGcsAsync(notice.ResponseAttachmentsJson, storage, userId, ct);
            notice.DeletedAt = now;
        }

        // 3. Anonymize org-shared notices where this user filed the response.
        //    The notice is retained for the organisation's compliance records.
        var respondedNotices = await db.GstNotices
            .Where(n => n.RespondedBy == userId && n.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var notice in respondedNotices)
        {
            notice.AnonymizeRespondent();
        }

        // 4. Soft-delete e_invoices and e_way_bills linked to the user's invoices.
        var invoiceIds = invoices.Select(i => i.Id).ToHashSet();
        if (invoiceIds.Count > 0)
        {
            var eInvoices = await db.EInvoices
                .Where(ei => invoiceIds.Contains(ei.GstInvoiceId) && ei.DeletedAt == null)
                .ToListAsync(ct);

            foreach (var ei in eInvoices)
            {
                ei.DeletedAt = now;
            }

            var eWayBills = await db.EWayBills
                .Where(ewb => ewb.GstInvoiceId.HasValue &&
                              invoiceIds.Contains(ewb.GstInvoiceId.Value) &&
                              ewb.DeletedAt == null)
                .ToListAsync(ct);

            foreach (var ewb in eWayBills)
            {
                ewb.DeletedAt = now;
            }
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Parses the GCS URI metadata JSON array (P6-HANDOFF-14 format) and deletes each object.
    /// Non-fatal: failures are logged as warnings and processing continues.
    /// </summary>
    private async Task DeleteAttachmentsFromGcsAsync(
        string? attachmentsJson,
        ICloudStorageService storage,
        Guid userId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(attachmentsJson)) return;

        try
        {
            var attachments = JsonSerializer.Deserialize<List<GcsAttachmentMeta>>(attachmentsJson, JsonOptions);
            if (attachments is null) return;

            foreach (var attachment in attachments)
            {
                if (string.IsNullOrWhiteSpace(attachment.GcsUri)) continue;
                try
                {
                    await storage.DeleteAsync(attachment.GcsUri, ct);
                    logger.LogInformation(
                        "SEC-040: Deleted GCS object {GcsUri} for user_id={UserId}",
                        attachment.GcsUri, userId);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex,
                        "SEC-040: Failed to delete GCS object {GcsUri} for user_id={UserId} — skipping.",
                        attachment.GcsUri, userId);
                }
            }
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex,
                "SEC-040: Could not parse attachments JSON for user_id={UserId} — skipping GCS deletion.", userId);
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record AccountDeletionPayload(Guid UserId);

    /// <summary>P6-HANDOFF-14 GCS attachment metadata shape (partial — only gcs_uri needed for deletion).</summary>
    private sealed record GcsAttachmentMeta(string GcsUri, string? Filename);
}
