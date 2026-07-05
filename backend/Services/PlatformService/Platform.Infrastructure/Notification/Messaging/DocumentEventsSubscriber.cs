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
/// DG-NOTIF-01: Pub/Sub subscriber for document lifecycle events from FinanceService.
/// Topic: snapaccount.document.ocr.completed
/// Subscription: notification-service-document-events-sub
///
/// Handled events:
///   OcrCompleted (status absent) → DOC_OCR_COMPLETED (Push, InApp)
///   OCR failed (status = "FAILED") → DOC_OCR_FAILED (Push, InApp)
///
/// The payload carries OrgId and DocumentId; UserId is resolved via the document's
/// uploaded_by column in the shared DB (raw SQL on document.documents).
/// If UserId resolution fails, the notification is silently dropped with a warning
/// (document OCR is best-effort for offline users).
/// </summary>
public sealed class DocumentEventsSubscriber(
    IConfiguration configuration,
    IServiceProvider services,
    ILogger<DocumentEventsSubscriber> logger) : BackgroundService
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
                "DocumentEventsSubscriber: GCP_PROJECT_ID not configured — document notifications disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_DOCUMENT_EVENTS"]
            ?? "notification-service-document-events-sub";
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        try
        {
            var subscriber = await SubscriberClient.CreateAsync(subscriptionName);
            logger.LogInformation("DocumentEventsSubscriber: Listening on {Subscription}", subscriptionName);

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
                    var payload = JsonSerializer.Deserialize<OcrCompletedPayload>(json, JsonOptions);
                    if (payload is null || payload.DocumentId == Guid.Empty)
                    {
                        logger.LogWarning("DocumentEventsSubscriber: unreadable message {MsgId}: {Json}", msgId, json);
                        return SubscriberClient.Reply.Ack;
                    }

                    await DispatchAsync(payload, ct);
                    return SubscriberClient.Reply.Ack;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "DocumentEventsSubscriber: failed for message {MsgId}", msgId);
                    lock (_processedIds) { _processedIds.Remove(msgId); }
                    return SubscriberClient.Reply.Nack;
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DocumentEventsSubscriber: could not start subscriber.");
        }
    }

    private async Task DispatchAsync(OcrCompletedPayload payload, CancellationToken ct)
    {
        // Resolve the document owner's UserId from document.documents.uploaded_by
        var userId = await ResolveDocumentOwnerAsync(payload.DocumentId, ct);
        if (userId is null)
        {
            logger.LogWarning(
                "DocumentEventsSubscriber: could not resolve owner for document {DocumentId} — skipping.",
                payload.DocumentId);
            return;
        }

        // All OCR completions map to DOC_OCR_COMPLETED (no failure event in this pipeline
        // because DocumentEventPublisher only publishes on approve/OCR-complete, not on failure).
        var eventCode = "DOC_OCR_COMPLETED";

        var variables = new Dictionary<string, string>
        {
            ["documentId"] = payload.DocumentId.ToString(),
            ["orgId"]      = payload.OrgId.ToString(),
            ["vendorName"] = payload.VendorName ?? "",
            ["amount"]     = payload.TotalAmount.ToString("F2")
        };

        using var scope = services.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        var command = new SendNotificationCommand(
            UserId: userId.Value,
            EventCode: eventCode,
            Locale: "en",
            Variables: variables.AsReadOnly());

        var result = await mediator.Send(command, ct);
        if (result.IsFailure)
            logger.LogWarning(
                "DocumentEventsSubscriber: dispatch failed for doc {DocumentId}: {Error}",
                payload.DocumentId, result.Error.Message);
        else
            logger.LogInformation(
                "DocumentEventsSubscriber: dispatched {EventCode} for doc {DocumentId}",
                eventCode, payload.DocumentId);
    }

    private async Task<Guid?> ResolveDocumentOwnerAsync(Guid documentId, CancellationToken ct)
    {
        try
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NotificationServiceDbContext>();

            var rows = await db.Database
                .SqlQueryRaw<Guid>(
                    "SELECT uploaded_by FROM document.documents WHERE id = {0} AND deleted_at IS NULL LIMIT 1",
                    documentId)
                .ToListAsync(ct);

            return rows.Count > 0 ? rows[0] : null;
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "DocumentEventsSubscriber: could not resolve owner for document {DocumentId}", documentId);
            return null;
        }
    }

    private sealed record OcrCompletedPayload(
        Guid OrgId,
        Guid DocumentId,
        string? ExtractedPayloadHash,
        decimal TotalAmount,
        string? VendorName,
        string? VendorGstin,
        string? DocumentDate,
        string? DocumentType,
        Guid? SuggestedDebitAccountId,
        Guid? SuggestedCreditAccountId,
        string? OcrText);
}
