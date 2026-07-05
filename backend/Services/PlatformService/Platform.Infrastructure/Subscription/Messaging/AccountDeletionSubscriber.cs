using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SubscriptionService.Infrastructure.Persistence;
using System.Text.Json;

namespace SubscriptionService.Infrastructure.Messaging;

/// <summary>
/// DPDP Act 2023 / SEC-052: Right-to-Erasure subscriber for SubscriptionService.
/// Listens on the <c>account-deletion-events</c> Pub/Sub topic.
/// On receipt:
///   - Anonymizes <c>subscription.subscriptions</c> rows: clears organization_id (Guid.Empty), sets anonymized_at + reason.
///   - Anonymizes <c>subscription.invoices</c> rows: clears organization_id (Guid.Empty), sets anonymized_at + reason.
/// Does NOT hard-delete — RBI compliance requires 7-year financial record retention.
/// </summary>
public sealed class AccountDeletionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AccountDeletionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "subscription-service-account-deletion-sub";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "DPDP: GCP_PROJECT_ID not configured — AccountDeletionSubscriber (SubscriptionService) will not start.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "DPDP: Failed to create Pub/Sub subscriber {Subscription}. SubscriptionService erasure disabled.",
                subscriptionName);
            return;
        }

        logger.LogInformation(
            "DPDP: AccountDeletionSubscriber (SubscriptionService) listening on {Sub}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            try
            {
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<AccountDeletionPayload>(json, JsonOptions);

                if (payload is null || payload.UserId == Guid.Empty)
                {
                    logger.LogWarning(
                        "DPDP: Malformed deletion event message_id={Id} — acking.", message.MessageId);
                    return SubscriberClient.Reply.Ack;
                }

                await AnonymizeUserDataAsync(payload.UserId, ct);
                logger.LogInformation(
                    "DPDP: SubscriptionService erasure complete for user_id={UserId}", payload.UserId);
                return SubscriberClient.Reply.Ack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "DPDP: SubscriptionService erasure failed for message_id={Id}", message.MessageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task AnonymizeUserDataAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SubscriptionServiceDbContext>();

        // Anonymize subscriptions owned by this user's organisation.
        // Note: We match on OrganizationId == userId because the deletion event carries the user's
        // own org ID in single-owner SME accounts. For multi-user orgs the auth service coordinates.
        var subscriptions = await db.Subscriptions
            .IgnoreQueryFilters()
            .Where(s => s.OrganizationId == userId)
            .ToListAsync(ct);

        foreach (var sub in subscriptions)
            sub.Anonymize("DPDP_USER_ERASURE");

        // Anonymize invoices for the same organisation
        var invoices = await db.Invoices
            .IgnoreQueryFilters()
            .Where(i => i.OrganizationId == userId)
            .ToListAsync(ct);

        foreach (var inv in invoices)
            inv.Anonymize("DPDP_USER_ERASURE");

        if (subscriptions.Count > 0 || invoices.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "DPDP: Anonymized {SubCount} subscriptions and {InvCount} invoices for org/user {UserId}.",
                subscriptions.Count, invoices.Count, userId);
        }
    }

    private sealed record AccountDeletionPayload(Guid UserId, string? Reason);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };
}
