using DocumentService.Application.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Google Document AI OCR service implementation.
/// TODO: Implement full Google Document AI integration using Google.Cloud.DocumentAI.V1 SDK.
/// </summary>
public sealed class GoogleDocumentAiService(
    ILogger<GoogleDocumentAiService> logger) : IOcrService
{
    public Task<Result<OcrExtractedData>> ExtractAsync(
        string storagePath,
        string mimeType,
        CancellationToken ct = default)
    {
        // TODO: Implement Google Document AI processing
        // 1. Download document from GCS
        // 2. Submit to Document AI processor (configured by ProcessorId in appsettings)
        // 3. Parse response into OcrExtractedData
        // 4. Return structured fields: invoice_number, total_amount, vendor_name, date, etc.

        logger.LogWarning("GoogleDocumentAiService.ExtractAsync is not yet implemented. StoragePath: {StoragePath}", storagePath);

        throw new NotImplementedException(
            "TODO: Integrate Google Cloud Document AI SDK. " +
            "See: https://cloud.google.com/document-ai/docs/send-request");
    }
}
