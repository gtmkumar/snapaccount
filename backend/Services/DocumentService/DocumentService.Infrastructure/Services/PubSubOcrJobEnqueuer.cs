using DocumentService.Application.Documents.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Pub/Sub-backed OCR job enqueuer. Publishes a message to the
/// <c>snapaccount.document.ocr.requested</c> topic; the OCR worker (background
/// service or Cloud Run Job) picks it up, runs Google Document AI, and
/// re-publishes <c>snapaccount.document.ocr.completed</c> on success.
/// </summary>
public sealed class PubSubOcrJobEnqueuer(
    IPubSubPublisher publisher,
    ILogger<PubSubOcrJobEnqueuer> logger) : IOcrJobEnqueuer
{
    private const string TopicName = "snapaccount.document.ocr.requested";

    public async Task EnqueueAsync(Guid documentId, CancellationToken cancellationToken)
    {
        try
        {
            await publisher.PublishAsync(TopicName, new OcrRequestedPayload(documentId), cancellationToken);
            logger.LogInformation("OCR enqueue published for document {DocumentId}", documentId);
        }
        catch (Exception ex)
        {
            // Status was already moved to OCR_IN_PROGRESS atomically with SaveChanges;
            // a failed enqueue must NOT roll that back, but it must be visible.
            logger.LogError(ex,
                "OCR enqueue failed for document {DocumentId} — status remains OCR_IN_PROGRESS, requires manual retry.",
                documentId);
        }
    }

    /// <summary>Pub/Sub payload — implements IDomainEvent for the publisher's generic constraint.</summary>
    private sealed record OcrRequestedPayload(Guid DocumentId) : DomainEvent;
}
