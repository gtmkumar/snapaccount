using System.Globalization;
using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using DocumentService.Application.Interfaces;
using DocumentService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DocumentService.Infrastructure.Services.Ocr;

/// <summary>
/// Runs OCR inline (synchronously, in-process) instead of publishing to Pub/Sub for an
/// out-of-band worker. Used when GCP is disabled. Unlike the old stub, this calls the registered
/// <see cref="IOcrService"/> (Tesseract by default) to perform REAL extraction, then persists the
/// structured result: summary fields on the <see cref="Document"/> plus a full
/// <see cref="OcrResult"/> + per-field <see cref="OcrField"/> rows, and marks the doc PROCESSED.
/// </summary>
public sealed class InlineOcrJobEnqueuer(
    IDocumentDbContext db,
    IOcrServiceResolver resolver,
    IAiUsageReporter usageReporter,
    ILogger<InlineOcrJobEnqueuer> logger) : IOcrJobEnqueuer
{
    public async Task EnqueueAsync(Guid documentId, CancellationToken cancellationToken)
    {
        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == documentId && d.DeletedAt == null, cancellationToken);
        if (doc is null) return;

        var resolved = await resolver.ResolveAsync(cancellationToken);
        logger.LogInformation("Inline OCR for {DocumentId} using provider {Provider}.", documentId, resolved.Provider);
        var result = await resolved.Service.ExtractAsync(doc.StoragePath, doc.MimeType, cancellationToken);

        // Meter the call (best-effort) — 1 unit = 1 document/page; tokens for token-billed providers.
        if (result.IsSuccess)
        {
            var metered = result.Value;
            await usageReporter.ReportAsync(
                resolved.Provider, resolved.Model, "ocr",
                metered.InputTokens, metered.OutputTokens, units: 1, metered.ProcessingTimeMs,
                doc.OrganizationId, cancellationToken);
        }

        if (result.IsFailure)
        {
            // Extraction failed — complete with no fields so the document still reaches a terminal
            // state (the client stops polling). Status reflects best-effort processing.
            logger.LogWarning("Inline OCR for {DocumentId} failed: {Error}", documentId, result.Error.Message);
            doc.CompleteOcr(amount: null, vendorName: null, documentDate: null);
            doc.MarkProcessed();
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        var data = result.Value;
        var fields = data.Fields;

        // Map the well-known fields onto the Document summary columns.
        decimal? amount = fields.TryGetValue("amount", out var a)
            && decimal.TryParse(a, NumberStyles.Any, CultureInfo.InvariantCulture, out var amt) ? amt : null;
        string? vendor = fields.GetValueOrDefault("vendor_name");
        DateOnly? date = fields.TryGetValue("document_date", out var d)
            && DateOnly.TryParse(d, CultureInfo.InvariantCulture, out var dt) ? dt : null;

        // Persist the full OCR result with one OcrField row per extracted field.
        var ocrResult = OcrResult.Create(
            doc.Id, DateTime.UtcNow, data.ConfidenceScore, data.RawResponse, data.ProcessingTimeMs);
        foreach (var (name, value) in fields)
            ocrResult.AddField(name, value, data.ConfidenceScore);
        db.OcrResults.Add(ocrResult);

        doc.CompleteOcr(amount, vendor, date);
        doc.MarkProcessed();

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Inline OCR: document {DocumentId} PROCESSED with {Count} fields (vendor={Vendor}, amount={Amount}).",
            documentId, fields.Count, vendor, amount);
    }
}
