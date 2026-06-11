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
    /// so AccountingService can post the journal entry for the approved document,
    /// and AiService's RagIngestionSubscriber can ingest the text into the RAG pipeline.
    ///
    /// The <paramref name="ocrText"/> parameter carries the raw extracted text directly
    /// in the Pub/Sub envelope, eliminating the need for downstream subscribers to
    /// re-fetch it from the document storage. Consumers should prefer this field
    /// and fall back to a storage fetch only when it is null/empty (e.g., for documents
    /// approved before this change was deployed).
    /// </summary>
    /// <param name="document">The approved document aggregate.</param>
    /// <param name="ocrText">
    /// Raw OCR text from the latest <see cref="OcrResult"/> for this document.
    /// May be null if no OCR result is available (document approved without OCR).
    /// </param>
    /// <param name="ct">Cancellation token.</param>
    Task PublishOcrCompletedAsync(Document document, string? ocrText = null, CancellationToken ct = default);
}
