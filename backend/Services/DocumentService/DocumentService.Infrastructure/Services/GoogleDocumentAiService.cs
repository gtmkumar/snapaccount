using DocumentService.Application.Interfaces;
using Google.Cloud.DocumentAI.V1;
using Google.Protobuf;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Storage;
using System.Diagnostics;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Google Document AI OCR service.
///
/// Real SDK integration: downloads the document from GCS via
/// <see cref="ICloudStorageService"/>, calls the configured Document AI
/// processor, and projects the response into <see cref="OcrExtractedData"/>.
///
/// Required configuration:
///   - <c>DocumentAi:ProjectId</c>
///   - <c>DocumentAi:Location</c>      (e.g. "us", "asia-south1")
///   - <c>DocumentAi:ProcessorId</c>   (Document AI processor resource id)
///
/// If any of those are missing the service returns a Result.Failure with
/// code <c>OCR.NotConfigured</c> rather than throwing — dev environments
/// can run without GCP credentials, and production will fail-loud the
/// first time a real OCR is requested.
/// </summary>
public sealed class GoogleDocumentAiService(
    IConfiguration configuration,
    ICloudStorageService storage,
    ILogger<GoogleDocumentAiService> logger) : IOcrService
{
    private readonly string? _projectId = configuration["DocumentAi:ProjectId"];
    private readonly string? _location = configuration["DocumentAi:Location"];
    private readonly string? _processorId = configuration["DocumentAi:ProcessorId"];

    public async Task<Result<OcrExtractedData>> ExtractAsync(
        string storagePath,
        string mimeType,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_projectId)
            || string.IsNullOrWhiteSpace(_location)
            || string.IsNullOrWhiteSpace(_processorId))
        {
            logger.LogError(
                "GoogleDocumentAiService not configured (project/location/processor missing). " +
                "Cannot OCR {StoragePath}.", storagePath);
            return Result<OcrExtractedData>.Failure(Error.Validation(
                "OCR.NotConfigured",
                "Google Document AI is not configured. Set DocumentAi:ProjectId, DocumentAi:Location, and DocumentAi:ProcessorId."));
        }

        var stopwatch = Stopwatch.StartNew();

        try
        {
            // 1. Download bytes from GCS.
            await using var stream = await storage.DownloadAsync(storagePath, ct);
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms, ct);
            var documentBytes = ms.ToArray();

            // 2. Call Document AI.
            var client = await DocumentProcessorServiceClient.CreateAsync(ct);
            var processorName = ProcessorName.FromProjectLocationProcessor(
                _projectId, _location, _processorId);

            var request = new ProcessRequest
            {
                Name = processorName.ToString(),
                RawDocument = new RawDocument
                {
                    Content = ByteString.CopyFrom(documentBytes),
                    MimeType = mimeType,
                },
                SkipHumanReview = true,
            };

            var response = await client.ProcessDocumentAsync(request);
            stopwatch.Stop();

            // 3. Project response → OcrExtractedData.
            var fields = ExtractFields(response.Document);
            var confidence = ComputeAverageConfidence(response.Document);

            logger.LogInformation(
                "Document AI processed {StoragePath} in {Ms}ms — {FieldCount} fields, confidence={Confidence}",
                storagePath, stopwatch.ElapsedMilliseconds, fields.Count, confidence);

            return new OcrExtractedData(
                ConfidenceScore: confidence,
                Fields: fields,
                RawResponse: response.Document.Text,
                ProcessingTimeMs: (int)stopwatch.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            logger.LogError(ex,
                "Document AI processing failed for {StoragePath} after {Ms}ms",
                storagePath, stopwatch.ElapsedMilliseconds);
            return Result<OcrExtractedData>.Failure(Error.Validation(
                "OCR.ProcessingFailed", $"Document AI failed: {ex.Message}"));
        }
    }

    /// <summary>
    /// Walks the Document AI Entity list and projects to a flat key→value map.
    /// Document AI returns named entities like "invoice_number", "total_amount",
    /// "vendor_name", "invoice_date" depending on the processor type.
    /// </summary>
    private static IReadOnlyDictionary<string, string> ExtractFields(Document doc)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entity in doc.Entities)
        {
            if (string.IsNullOrEmpty(entity.Type) || string.IsNullOrEmpty(entity.MentionText))
                continue;

            // Last-write-wins for repeated types — sufficient for invoice/receipt processors.
            dict[entity.Type] = entity.MentionText;
        }
        return dict;
    }

    private static decimal? ComputeAverageConfidence(Document doc)
    {
        if (doc.Entities.Count == 0) return null;
        var sum = 0.0;
        var count = 0;
        foreach (var entity in doc.Entities)
        {
            sum += entity.Confidence;
            count++;
        }
        return count == 0 ? null : (decimal)(sum / count);
    }
}
