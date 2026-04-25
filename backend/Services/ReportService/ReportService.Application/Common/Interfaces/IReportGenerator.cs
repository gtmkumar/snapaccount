using ReportService.Domain.Entities;

namespace ReportService.Application.Common.Interfaces;

/// <summary>
/// Generates report files (PDF via QuestPDF or JSON) and uploads them to GCS.
/// Each implementation handles one or more ReportType values.
/// </summary>
public interface IReportGenerator
{
    /// <summary>
    /// Generates a report for the given job and returns the GCS URI and SHA-256 hash.
    /// </summary>
    /// <param name="job">The report job with all required parameters.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Tuple of (gcsUri, sha256HashHex, pageCount).</returns>
    Task<ReportGenerationResult> GenerateAsync(ReportJob job, CancellationToken ct);

    /// <summary>Returns true if this generator supports the given report type and format.</summary>
    bool Supports(ReportType reportType, ReportFormat format);
}

/// <summary>Result of report generation.</summary>
public sealed record ReportGenerationResult(
    string GcsUri,
    string Sha256HashHex,
    int PageCount);
