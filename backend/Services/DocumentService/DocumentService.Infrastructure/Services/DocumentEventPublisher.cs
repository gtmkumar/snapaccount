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
/// </summary>
public sealed class DocumentEventPublisher(
    IPubSubPublisher publisher,
    ILogger<DocumentEventPublisher> logger) : IDocumentEventPublisher
{
    /// <summary>Pub/Sub topic that AccountingService subscribes to (accounting-service-ocr-sub).</summary>
    private const string OcrCompletedTopic = "snapaccount.document.ocr.completed";

    /// <inheritdoc />
    public async Task PublishOcrCompletedAsync(Document document, CancellationToken ct = default)
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
            SuggestedCreditAccountId: null);

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
    Guid? SuggestedCreditAccountId) : DomainEvent;
