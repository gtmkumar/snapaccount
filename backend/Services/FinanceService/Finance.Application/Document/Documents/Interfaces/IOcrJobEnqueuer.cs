namespace DocumentService.Application.Documents.Interfaces;

/// <summary>
/// Enqueues an out-of-band OCR job (Hangfire / Pub/Sub fan-out) for a document.
/// Implementation in Infrastructure; default in-process noop is provided for
/// services without an enqueue backplane configured.
/// </summary>
public interface IOcrJobEnqueuer
{
    Task EnqueueAsync(Guid documentId, CancellationToken cancellationToken);
}
