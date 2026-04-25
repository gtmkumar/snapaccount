using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Interfaces;

public record OcrExtractedData(
    decimal? ConfidenceScore,
    IReadOnlyDictionary<string, string> Fields,
    string? RawResponse,
    int ProcessingTimeMs);

public interface IOcrService
{
    /// <summary>
    /// Calls Google Document AI to extract structured data from a document image/PDF.
    /// </summary>
    Task<Result<OcrExtractedData>> ExtractAsync(string storagePath, string mimeType, CancellationToken ct = default);
}
