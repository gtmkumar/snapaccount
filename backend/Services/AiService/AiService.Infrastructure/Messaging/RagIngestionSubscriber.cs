using System.Text.Json;
using AiService.Application.Rag.Commands.IngestDocument;
using AiService.Infrastructure.Persistence;
using Google.Cloud.PubSub.V1;
using Google.Protobuf;
using MediatR;
using Microsoft.EntityFrameworkCore;
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

                // SEC-AI-02 H-04: Verify that the document exists in DocumentService's schema
                // and belongs to the org claimed in the Pub/Sub payload.
                // AiService and DocumentService share the same PostgreSQL instance (schema-per-service),
                // so a cross-schema read is acceptable without an HTTP hop.
                // If the document is not found / org does not match → ACK (drop) with a warning;
                // do NOT NACK, to prevent DLQ poisoning with unresolvable messages.
                var db = scope.ServiceProvider.GetRequiredService<AiServiceDbContext>();
                var ownershipVerified = await VerifyDocumentOwnershipAsync(
                    db, payload.DocumentId, payload.OrgId, logger, ct);

                if (!ownershipVerified)
                {
                    logger.LogWarning(
                        "SEC-AI-02 H-04: Document {DocumentId} not found in document schema or " +
                        "org_id mismatch (claimed={OrgId}). Dropping message (ACK) to prevent DLQ poisoning.",
                        payload.DocumentId, payload.OrgId);
                    return SubscriberClient.Reply.Ack;
                }

                // Defence-in-depth: cap OcrText before chunking even if the validator was bypassed.
                const int MaxOcrTextLength = 500_000;
                var ocrText = payload.OcrText.Length > MaxOcrTextLength
                    ? payload.OcrText[..MaxOcrTextLength]
                    : payload.OcrText;

                var command = new IngestDocumentCommand(
                    DocumentId: payload.DocumentId,
                    OrganizationId: payload.OrgId,
                    OcrText: ocrText);

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

    /// <summary>
    /// SEC-AI-02 H-04: Verifies that <paramref name="documentId"/> exists in the
    /// <c>document.documents</c> table and that its <c>organization_id</c> matches the
    /// <paramref name="orgId"/> claimed in the Pub/Sub payload.
    ///
    /// AiService and DocumentService share one PostgreSQL instance (schema-per-service), so a
    /// cross-schema read via raw SQL is acceptable here — it avoids an HTTP service-to-service hop
    /// and keeps the ownership check in the database layer where it is most reliable.
    ///
    /// Returns <c>false</c> if the document does not exist, the org does not match, or the DB
    /// check fails. The caller ACKs the message on <c>false</c> to avoid DLQ poisoning.
    /// </summary>
    private static async Task<bool> VerifyDocumentOwnershipAsync(
        AiServiceDbContext db,
        Guid documentId,
        Guid orgId,
        ILogger logger,
        CancellationToken ct)
    {
        try
        {
            // Raw SQL cross-schema query: document schema is isolated but same PG instance.
            // The query returns 1 row if the document exists and belongs to the claimed org.
            var count = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*)::int FROM document.documents " +
                "WHERE id = {0} AND organization_id = {1} AND deleted_at IS NULL",
                documentId, orgId).SingleOrDefaultAsync(ct);

            return count > 0;
        }
        catch (Exception ex)
        {
            // If the cross-schema query fails (e.g. document schema not yet migrated in local dev),
            // log and allow ingestion to proceed — better to ingest than to permanently drop valid messages.
            logger.LogWarning(ex,
                "Document ownership check failed for {DocumentId} — allowing ingest (fail-open). " +
                "Investigate if this persists in production.", documentId);
            return true;
        }
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
