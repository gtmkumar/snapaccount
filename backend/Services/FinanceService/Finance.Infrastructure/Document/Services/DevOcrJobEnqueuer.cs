using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Local-dev <see cref="IOcrJobEnqueuer"/> used when GCP (Pub/Sub + Document AI) is disabled.
/// Instead of publishing to Pub/Sub for an out-of-band worker, it "completes" OCR inline with
/// stub extracted fields so the mobile scan flow reaches a terminal, success-like state without
/// Google Document AI. Real OCR extraction requires GCP and is wired in staging/production via
/// <see cref="PubSubOcrJobEnqueuer"/> + the OCR worker. NEVER registered outside local dev.
/// </summary>
public sealed class DevOcrJobEnqueuer(
    IDocumentDbContext db,
    ILogger<DevOcrJobEnqueuer> logger) : IOcrJobEnqueuer
{
    public async Task EnqueueAsync(Guid documentId, CancellationToken cancellationToken)
    {
        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == documentId && d.DeletedAt == null, cancellationToken);
        if (doc is null)
            return;

        // Stub extraction — Document AI is unavailable locally. Values are placeholders that
        // make the document render as a processed receipt in the app.
        doc.CompleteOcr(amount: null, vendorName: "Scanned document (dev OCR stub)", documentDate: null);
        doc.MarkProcessed();
        await db.SaveChangesAsync(cancellationToken);

        logger.LogWarning(
            "DEV OCR (no GCP): document {DocumentId} marked PROCESSED with stub extraction.",
            documentId);
    }
}
