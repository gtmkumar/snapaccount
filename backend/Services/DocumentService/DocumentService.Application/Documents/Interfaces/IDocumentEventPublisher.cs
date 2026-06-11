using DocumentService.Domain.Entities;

namespace DocumentService.Application.Documents.Interfaces;

/// <summary>
/// Publishes cross-service document events to the messaging infrastructure.
/// Decouples the Application layer from concrete Pub/Sub implementation.
/// </summary>
public interface IDocumentEventPublisher
{
    /// <summary>
    /// Publishes <c>snapaccount.document.ocr.completed</c> to the Pub/Sub topic
    /// so AccountingService can post the journal entry for the approved document.
    /// This reuses the exact payload shape that AccountingService's OcrResultSubscriber expects.
    /// </summary>
    /// <param name="document">The approved document aggregate.</param>
    /// <param name="ct">Cancellation token.</param>
    Task PublishOcrCompletedAsync(Document document, CancellationToken ct = default);
}
