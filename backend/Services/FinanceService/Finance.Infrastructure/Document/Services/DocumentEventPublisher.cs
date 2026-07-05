using DocumentService.Application.Documents.Interfaces;
using DocumentService.Domain.Entities;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Infrastructure implementation of <see cref="IDocumentEventPublisher"/>.
/// Publishes to <c>snapaccount.document.ocr.completed</c> using the exact payload shape
/// consumed by AccountingService's <c>OcrResultSubscriber</c>/<c>PostFromOcrCommand</c>.
/// Also publishes to <c>snapaccount.document.events</c> for NotificationService fan-out.
/// </summary>
public sealed class DocumentEventPublisher(
    IPubSubPublisher publisher,
    ILogger<DocumentEventPublisher> logger) : IDocumentEventPublisher
{
    /// <summary>Pub/Sub topic that AccountingService subscribes to (accounting-service-ocr-sub).</summary>
    private const string OcrCompletedTopic = "snapaccount.document.ocr.completed";

    /// <summary>Pub/Sub topic for general document lifecycle events (notification fan-out).</summary>
    private const string DocumentEventsTopic = "snapaccount.document.events";

    /// <inheritdoc />
    public async Task PublishOcrCompletedAsync(Document document, string? ocrText = null, CancellationToken ct = default)
    {
        // Build the payload hash from the document's extracted fields so
        // AccountingService can compute its DedupeHash identically.
        var extractedPayloadHash = ComputeExtractedPayloadHash(document);

        var payload = new OcrCompletedAccountingPayload(
            OrgId: document.OrganizationId ?? Guid.Empty,
            DocumentId: document.Id,
            ExtractedPayloadHash: extractedPayloadHash,
            TotalAmount: document.Amount ?? 0m,
            VendorName: document.VendorName,
            VendorGstin: null,
            DocumentDate: document.DocumentDate ?? DateOnly.FromDateTime(document.UploadedAt),
            DocumentType: null,
            SuggestedDebitAccountId: null,
            SuggestedCreditAccountId: null,
            OcrText: ocrText);

        try
        {
            await publisher.PublishAsync(OcrCompletedTopic, payload, ct);
            logger.LogInformation(
                "Published OcrCompleted event for approved document {DocumentId} (org {OrgId})",
                document.Id, document.OrganizationId);
        }
        catch (Exception ex)
        {
            // Log but do not rethrow — the approve action itself succeeded in the DB.
            // AccountingService will eventually pick up via a manual re-trigger or compensating flow.
            logger.LogError(ex,
                "Failed to publish OcrCompleted event for document {DocumentId} to topic {Topic}. " +
                "Accounting pipeline may need manual re-trigger.",
                document.Id, OcrCompletedTopic);
        }
    }

    /// <inheritdoc />
    public async Task PublishClarificationRequestedAsync(
        Document document,
        string message,
        CancellationToken ct = default)
    {
        var payload = new DocumentClarificationRequestedPayload(
            EventType: "ClarificationRequested",
            OrgId: document.OrganizationId ?? Guid.Empty,
            DocumentId: document.Id,
            UserId: document.UserId ?? Guid.Empty,
            Message: message);

        try
        {
            await publisher.PublishAsync(DocumentEventsTopic, payload, ct);
            logger.LogInformation(
                "Published ClarificationRequested event for document {DocumentId} (user {UserId})",
                document.Id, document.UserId);
        }
        catch (Exception ex)
        {
            // Log but do not rethrow — the clarification was saved; only the push notification fails.
            logger.LogError(ex,
                "Failed to publish ClarificationRequested event for document {DocumentId}. " +
                "Push notification to user will not be delivered.",
                document.Id);
        }
    }

    /// <summary>
    /// Computes a deterministic hash of the document's extracted fields so AccountingService
    /// can reproduce the DedupeHash = SHA-256(document_id_bytes || extracted_payload_hash_bytes).
    /// </summary>
    private static string ComputeExtractedPayloadHash(Document document)
    {
        // Stable JSON representation of the fields AccountingService uses for deduplication.
        var content = JsonSerializer.Serialize(new
        {
            amount = document.Amount,
            vendorName = document.VendorName,
            documentDate = document.DocumentDate?.ToString("yyyy-MM-dd")
        });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
    }
}

/// <summary>
/// Payload shape matching AccountingService's <c>OcrCompletedPayload</c> record.
/// Serialised to the <c>snapaccount.document.ocr.completed</c> Pub/Sub topic.
/// IMPORTANT: field names must match exactly what AccountingService deserialises
/// (camelCase via <see cref="System.Text.Json.JsonNamingPolicy.CamelCase"/>).
///
/// <para><b>OcrText</b>: added in Phase 7 task #3. Downstream subscribers (AiService
/// RagIngestionSubscriber) should prefer this field when present and fall back to a
/// storage fetch when null (e.g., documents approved before this deployment).</para>
/// </summary>
internal sealed record OcrCompletedAccountingPayload(
    Guid OrgId,
    Guid DocumentId,
    string ExtractedPayloadHash,
    decimal TotalAmount,
    string? VendorName,
    string? VendorGstin,
    DateOnly DocumentDate,
    string? DocumentType,
    Guid? SuggestedDebitAccountId,
    Guid? SuggestedCreditAccountId,
    string? OcrText = null) : DomainEvent;

/// <summary>
/// DG-NOTIF-01: Payload for document lifecycle events (clarification, etc.)
/// published to <c>snapaccount.document.events</c>.
/// </summary>
internal sealed record DocumentClarificationRequestedPayload(
    string EventType,
    Guid OrgId,
    Guid DocumentId,
    Guid UserId,
    string Message) : DomainEvent;
