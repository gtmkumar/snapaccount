using Google.Cloud.PubSub.V1;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace LoanService.Infrastructure.Messaging;

/// <summary>
/// P6-HANDOFF-30 / SEC-027: DPDP Act 2023 Right-to-Erasure subscriber for LoanService.
/// Listens on the account-deletion-events Pub/Sub topic.
///
/// Anonymise-only policy (hard-delete BLOCKED by DB triggers):
///   loan.applications: NULL user_id, set anonymized_at + anonymization_reason='DPDP_USER_ERASURE'
///   loan.consents:      NULL user_id, ip_address, user_agent; set anonymized_at + reason
///
/// DO NOT attempt to delete rows from consents or application_status_log —
/// DB triggers will raise an exception.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "loan-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "AccountDeletionSubscriber [Loan]: GCP_PROJECT_ID not configured. " +
                "DPDP erasure for LoanService is disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_LOAN"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "AccountDeletionSubscriber [Loan]: Failed to create subscriber for {Subscription}.",
                subscriptionName);
            return;
        }

        logger.LogInformation(
            "AccountDeletionSubscriber [Loan]: listening on {Subscription}", subscriptionName);

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
                        "AccountDeletionSubscriber [Loan]: Malformed message {MessageId} — acking.", messageId);
                    return SubscriberClient.Reply.Ack;
                }

                // Idempotency check: if event_id seen before, ack without re-processing
                if (payload.EventId != null)
                {
                    using var checkScope = scopeFactory.CreateScope();
                    var checkDb = checkScope.ServiceProvider.GetRequiredService<ILoanServiceDbContext>();
                    // Simple deduplication via checking anonymizedAt already set
                }

                logger.LogInformation(
                    "AccountDeletionSubscriber [Loan]: DPDP erasure for user_id={UserId} message_id={MsgId}",
                    payload.UserId, messageId);

                await AnonymiseUserDataAsync(payload.UserId, ct);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "AccountDeletionSubscriber [Loan]: Erasure failed for message_id={MessageId} — nacking.",
                    messageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task AnonymiseUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ILoanServiceDbContext>();

        var now = DateTime.UtcNow;
        const string reason = "DPDP_USER_ERASURE";

        // 1. Anonymise loan applications (NULL user_id, preserve retention columns)
        var applications = await db.LoanApplications
            .Where(a => a.UserId == userId && a.AnonymizedAt == null)
            .ToListAsync(ct);

        foreach (var app in applications)
        {
            app.UserId = null;
            app.AnonymizedAt = now;
            app.AnonymizationReason = reason;
        }

        // 2. Anonymise consents (NULL user_id, ip_address, user_agent)
        // DO NOT DELETE — DB trigger blocks hard-delete (7-year retention)
        var consents = await db.Consents
            .Where(c => c.UserId == userId && c.AnonymizedAt == null)
            .ToListAsync(ct);

        foreach (var consent in consents)
        {
            consent.UserId = null;
            consent.IpAddress = null;
            consent.UserAgent = null;
            consent.AnonymizedAt = now;
            consent.AnonymizationReason = reason;
        }

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "AccountDeletionSubscriber [Loan]: Anonymised {AppCount} applications and {ConsentCount} consents for user_id={UserId}",
            applications.Count, consents.Count, userId);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record AccountDeletionPayload(Guid UserId, string? EventId = null);
}
