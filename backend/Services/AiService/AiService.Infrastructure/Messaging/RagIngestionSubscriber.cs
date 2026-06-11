using System.Text.Json;
using AiService.Application.Rag.Commands.IngestDocument;
using Google.Cloud.PubSub.V1;
using Google.Protobuf;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AiService.Infrastructure.Messaging;

/// <summary>
/// Hosted background service that subscribes to the
/// <c>snapaccount.document.ocr.completed</c> Pub/Sub topic via the
/// <c>ai-service-rag-sub</c> subscription.
///
/// This is a SEPARATE subscription from AccountingService's <c>accounting-service-ocr-sub</c>
/// on the same topic. Both consumers receive every message independently — no interference.
///
/// Payload shape: same as <c>OcrCompletedPayload</c> in AccountingService (camelCase JSON).
/// Required payload fields for RAG: documentId, orgId, ocrText.
/// Optional: vendorName, documentDate, documentType (stored as metadata, P7b).
///
/// Message lifecycle:
/// <list type="bullet">
///   <item>ACK on successful ingestion or empty ocrText (nothing to ingest).</item>
///   <item>NACK on transient errors — Pub/Sub retries with exponential backoff.</item>
///   <item>DLQ after max delivery attempts (configured in Pub/Sub, typically 5).</item>
/// </list>
///
/// GCP-free local dev: this subscriber is only started when GCP is enabled
/// (see <see cref="AiService.Infrastructure.DependencyInjection"/>).
/// </summary>
public sealed class RagIngestionSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<RagIngestionSubscriber> logger) : BackgroundService
{
    private const string DefaultSubscription = "ai-service-rag-sub";
    private const string DefaultProjectId = "local-dev";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? DefaultProjectId;
        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_RAG"] ?? DefaultSubscription;

        logger.LogInformation(
            "RagIngestionSubscriber starting — project={ProjectId} subscription={SubscriptionId}",
            projectId, subscriptionId);

        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Pub/Sub subscriber could not be created (emulator not running?). " +
                "RagIngestionSubscriber will not process messages in this session.");
            return;
        }

        await subscriber.StartAsync(async (message, ct) =>
        {
            using var scope = scopeFactory.CreateScope();
            var sender = scope.ServiceProvider.GetRequiredService<ISender>();

            try
            {
                var payload = JsonSerializer.Deserialize<RagOcrPayload>(
                    message.Data.ToStringUtf8(),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (payload is null || payload.DocumentId == Guid.Empty)
                {
                    logger.LogWarning("RagIngestionSubscriber received null/invalid payload — ACK (skip).");
                    return SubscriberClient.Reply.Ack;
                }

                if (string.IsNullOrWhiteSpace(payload.OcrText))
                {
                    logger.LogInformation(
                        "Document {DocumentId} has no OCR text — ACK (nothing to ingest).",
                        payload.DocumentId);
                    return SubscriberClient.Reply.Ack;
                }

                var command = new IngestDocumentCommand(
                    DocumentId: payload.DocumentId,
                    OrganizationId: payload.OrgId,
                    OcrText: payload.OcrText);

                var result = await sender.Send(command, ct);
                if (result.IsSuccess)
                {
                    logger.LogInformation(
                        "RAG ingestion succeeded for document {DocumentId}.", payload.DocumentId);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogError("RAG ingestion failed for document {DocumentId}: {Error}",
                    payload.DocumentId, result.Error.Message);
                return SubscriberClient.Reply.Nack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Unhandled exception processing RAG Pub/Sub message");
                return SubscriberClient.Reply.Nack;
            }
        });

#pragma warning disable CS0618
        stoppingToken.Register(() => subscriber.StopAsync(CancellationToken.None));
#pragma warning restore CS0618
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }
}

/// <summary>
/// Payload shape of <c>snapaccount.document.ocr.completed</c> messages consumed by AiService.
/// Mirrors <c>OcrCompletedPayload</c> in AccountingService (camelCase deserialisation).
/// The <see cref="OcrText"/> field is added to the Pub/Sub payload by DocumentService when
/// it publishes the approve event (db-engineer DDL handoff item — see P7a handoff notes).
/// </summary>
internal sealed class RagOcrPayload
{
    public Guid OrgId { get; init; }
    public Guid DocumentId { get; init; }
    public decimal TotalAmount { get; init; }
    public string? VendorName { get; init; }
    public DateOnly DocumentDate { get; init; }
    public string? DocumentType { get; init; }

    /// <summary>
    /// Full OCR text — added to the Pub/Sub envelope by DocumentService (P7a requirement).
    /// May be null for documents approved before this change (treat as nothing-to-ingest).
    /// </summary>
    public string? OcrText { get; init; }
}
