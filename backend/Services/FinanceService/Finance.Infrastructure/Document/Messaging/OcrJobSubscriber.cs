using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Interfaces;
using DocumentService.Domain.Entities;
using Google.Cloud.PubSub.V1;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;
using System.Text.Json;

namespace DocumentService.Infrastructure.Messaging;

/// <summary>
/// Consumes <c>snapaccount.document.ocr.requested</c> Pub/Sub messages
/// (published by <c>PubSubOcrJobEnqueuer</c> when admin/mobile invokes
/// <c>POST /documents/{id}/ocr</c>).
///
/// For each message:
///   1. Loads the Document by id; verifies still in OCR_IN_PROGRESS.
///   2. Calls the OCR service (Google Document AI) on its storage path.
///   3. Persists an OcrResult + per-field OcrField rows.
///   4. Calls <c>Document.CompleteOcr(...)</c> which moves the status to
///      OCR_COMPLETE AND raises OcrCompletedEvent (the existing
///      DispatchDomainEventsInterceptor publishes it onto Pub/Sub →
///      AccountingService.OcrResultSubscriber posts the journal entry).
///
/// Failure handling:
///   - OCR config missing  → ACK (no point retrying); document stays in
///     OCR_IN_PROGRESS for human triage.
///   - Transient OCR error → NACK; Pub/Sub retries with exponential backoff.
///   - Doc not found / wrong status → ACK silently (idempotency).
/// </summary>
public sealed class OcrJobSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<OcrJobSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "document-service-ocr-requested-sub";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? configuration["GcpProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "GCP_PROJECT_ID not configured — OcrJobSubscriber will not start. " +
                "OCR pipeline is disabled.");
            return;
        }

        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_OCR_REQUESTED"] ?? DefaultSubscription;
        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Failed to create Pub/Sub subscriber {Subscription}. OCR pipeline is disabled this session.",
                subscriptionName);
            return;
        }

        logger.LogInformation("OcrJobSubscriber listening on {Subscription}", subscriptionName);

        await subscriber.StartAsync(async (message, ct) =>
        {
            var messageId = message.MessageId;
            try
            {
                var json = message.Data.ToStringUtf8();
                var payload = JsonSerializer.Deserialize<OcrRequestedPayload>(json, JsonOptions);
                if (payload is null || payload.DocumentId == Guid.Empty)
                {
                    logger.LogWarning(
                        "Malformed OCR request message_id={Id} — acking to avoid redelivery loop.", messageId);
                    return SubscriberClient.Reply.Ack;
                }

                var reply = await ProcessAsync(payload.DocumentId, ct);
                return reply;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "OCR worker failure message_id={Id} — nacking", messageId);
                return SubscriberClient.Reply.Nack;
            }
        });
    }

    private async Task<SubscriberClient.Reply> ProcessAsync(Guid documentId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDocumentDbContext>();
        var ocr = scope.ServiceProvider.GetRequiredService<IOcrService>();

        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == documentId && d.DeletedAt == null, ct);
        if (doc is null)
        {
            logger.LogWarning("OCR worker: document {Id} not found — acking.", documentId);
            return SubscriberClient.Reply.Ack;
        }

        // Idempotency: only process docs the RequestOcr handler put in OCR_IN_PROGRESS.
        if (doc.Status != "OCR_IN_PROGRESS")
        {
            logger.LogInformation(
                "OCR worker: document {Id} already in status {Status} — acking.", documentId, doc.Status);
            return SubscriberClient.Reply.Ack;
        }

        var extractResult = await ocr.ExtractAsync(doc.StoragePath, doc.MimeType, ct);
        if (extractResult.IsFailure)
        {
            // OCR.NotConfigured → ACK; transient errors → NACK so Pub/Sub redelivery picks it up.
            if (extractResult.Error.Code == "OCR.NotConfigured")
            {
                logger.LogError(
                    "OCR worker: provider not configured — document {Id} stays in OCR_IN_PROGRESS for human triage. ACK.",
                    documentId);
                return SubscriberClient.Reply.Ack;
            }

            logger.LogWarning(
                "OCR worker: extract failed for document {Id} ({Code}: {Msg}) — NACK for redelivery.",
                documentId, extractResult.Error.Code, extractResult.Error.Message);
            return SubscriberClient.Reply.Nack;
        }

        var data = extractResult.Value;

        // Persist OcrResult + per-field OcrFields.
        var result = OcrResult.Create(
            documentId: doc.Id,
            documentAt: doc.UploadedAt,
            confidenceScore: data.ConfidenceScore,
            rawResponse: data.RawResponse,
            processingTimeMs: data.ProcessingTimeMs);

        foreach (var (key, value) in data.Fields)
            result.AddField(key, value, confidence: null);

        db.OcrResults.Add(result);

        // Project well-known invoice/receipt fields back onto the Document so
        // dashboards + AccountingService.OcrResultSubscriber have summary data.
        var amount = TryParseAmount(data.Fields, "total_amount", "invoice_amount", "amount");
        var vendor = TryGet(data.Fields, "vendor_name", "supplier_name", "merchant_name");
        var docDate = TryParseDate(data.Fields, "invoice_date", "document_date", "date");

        doc.CompleteOcr(amount, vendor, docDate);

        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "OCR worker: document {Id} OCR complete (confidence={Confidence}, fields={FieldCount}, ms={Ms})",
            documentId, data.ConfidenceScore, data.Fields.Count, data.ProcessingTimeMs);

        return SubscriberClient.Reply.Ack;
    }

    private static string? TryGet(IReadOnlyDictionary<string, string> fields, params string[] keys)
    {
        foreach (var k in keys)
            if (fields.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v))
                return v;
        return null;
    }

    private static decimal? TryParseAmount(IReadOnlyDictionary<string, string> fields, params string[] keys)
    {
        var raw = TryGet(fields, keys);
        if (raw is null) return null;
        // Strip currency symbols, commas, spaces.
        var cleaned = new string(raw.Where(c => char.IsDigit(c) || c == '.' || c == '-').ToArray());
        return decimal.TryParse(cleaned, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    private static DateOnly? TryParseDate(IReadOnlyDictionary<string, string> fields, params string[] keys)
    {
        var raw = TryGet(fields, keys);
        if (raw is null) return null;
        return DateOnly.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record OcrRequestedPayload(Guid DocumentId);
}
