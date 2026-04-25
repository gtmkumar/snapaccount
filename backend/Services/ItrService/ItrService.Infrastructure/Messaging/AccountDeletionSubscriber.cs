using Google.Cloud.PubSub.V1;
using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace ItrService.Infrastructure.Messaging;

/// <summary>
/// SEC-040: DPDP Act 2023 Right-to-Erasure subscriber for ItrService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic.
/// On receipt:
///   - Soft-deletes and anonymizes <c>itr.assessee_profiles</c> for the user.
///   - Soft-deletes <c>itr.filings</c> for the user's assessees and anonymizes PII fields.
///   - Soft-deletes <c>itr.form_16_extracts</c> for the user's filings.
///   - Soft-deletes <c>itr.notices</c> authored by the user.
///   - Anonymizes <c>itr.refund_status_log</c> entries — scrubs user_id from audit trail.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "itr-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "SEC-040: GCP_PROJECT_ID not configured — ItrService AccountDeletionSubscriber will not start. " +
                "DPDP erasure for ItrService is disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_ITR"] ?? DefaultSubscription;
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
                "DPDP erasure for ItrService is disabled.", subscriptionName);
            return;
        }

        logger.LogInformation(
            "SEC-040: ItrService AccountDeletionSubscriber listening on {Subscription}", subscriptionName);

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
        var db = scope.ServiceProvider.GetRequiredService<IItrDbContext>();

        var now = DateTime.UtcNow;
        // BaseAuditableEntity.CreatedBy stores Firebase UID as a string
        var userIdString = userId.ToString();

        // 1. Find assessee profiles for this user (Assessee.UserId is the Firebase UID string).
        //    Soft-delete and anonymize all PII fields per DPDP Act 2023, Section 12.
        //    Default = soft-delete + anonymize (not hard-delete) to preserve ITR filing audit trail.
        var assessees = await db.Assessees
            .Where(a => a.UserId == userIdString && a.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var assessee in assessees)
        {
            assessee.Anonymize("DPDP_ERASURE");
            assessee.DeletedAt = now;
        }

        var assesseeIds = assessees.Select(a => a.Id).ToHashSet();

        if (assesseeIds.Count > 0)
        {
            // 2. Soft-delete and anonymize itr.filings for these assessees.
            var filings = await db.Filings
                .Where(f => assesseeIds.Contains(f.AssesseeId) && f.DeletedAt == null)
                .ToListAsync(ct);

            foreach (var filing in filings)
            {
                filing.Anonymize("DPDP_ERASURE");
                filing.DeletedAt = now;
            }

            var filingIds = filings.Select(f => f.Id).ToHashSet();

            if (filingIds.Count > 0)
            {
                // 3. Soft-delete itr.form_16_extracts for the user's filings.
                //    ParsedJson contains employer TAN/PAN/salary — cleared by Form16Extract.Anonymize().
                var form16Extracts = await db.Form16Extracts
                    .Where(e => filingIds.Contains(e.FilingId) && e.DeletedAt == null)
                    .ToListAsync(ct);

                foreach (var extract in form16Extracts)
                {
                    extract.Anonymize("DPDP_ERASURE");
                    extract.DeletedAt = now;
                }
            }

            // 4. Soft-delete itr.notices for the user's assessees.
            var notices = await db.ItrNotices
                .Where(n => assesseeIds.Contains(n.AssesseeId) && n.DeletedAt == null)
                .ToListAsync(ct);

            foreach (var notice in notices)
            {
                notice.Anonymize("DPDP_ERASURE");
                notice.DeletedAt = now;
            }
        }

        // 5. Anonymize itr.refund_status_log — keep audit trail, scrub user reference.
        //    RefundStatusEntry is keyed to a filing; we anonymize entries for the user's assessees.
        //    CreatedBy is the Firebase UID string.
        var refundEntries = await db.RefundStatusEntries
            .Where(r => r.CreatedBy == userIdString && r.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var entry in refundEntries)
        {
            // Anonymize by clearing the creator reference; retain the entry for audit
            entry.UpdatedBy = null;
            entry.CreatedBy = null;
        }

        await db.SaveChangesAsync(ct);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record AccountDeletionPayload(Guid UserId);
}
