using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>
/// Base class for all QuestPDF report generators.
/// Handles PDF rendering, SHA-256 hashing, and GCS upload.
/// </summary>
public abstract class BaseReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger logger) : IReportGenerator
{
    private readonly string _bucketName =
        Environment.GetEnvironmentVariable("GCS_REPORTS_BUCKET")
        ?? configuration["GCS:ReportsBucket"]
        ?? "snapaccount-reports-dev";

    /// <inheritdoc />
    public abstract bool Supports(ReportType reportType, ReportFormat format);

    /// <inheritdoc />
    public async Task<ReportGenerationResult> GenerateAsync(ReportJob job, CancellationToken ct)
    {
        byte[] fileBytes;
        string contentType;
        string extension;
        int pageCount;

        if (job.Format == ReportFormat.Pdf)
        {
            var document = BuildDocument(job);
            fileBytes = document.GeneratePdf();
            contentType = "application/pdf";
            extension = "pdf";
            pageCount = EstimatePageCount(fileBytes);
        }
        else
        {
            var json = BuildJson(job);
            fileBytes = System.Text.Encoding.UTF8.GetBytes(json);
            contentType = "application/json";
            extension = "json";
            pageCount = 0;
        }

        var sha256 = SHA256.HashData(fileBytes);
        var sha256Hex = Convert.ToHexString(sha256).ToLowerInvariant();

        var objectName = BuildObjectName(job, extension);
        var gcsUri = await storage.UploadAsync(_bucketName, objectName, fileBytes, contentType, ct);

        logger.LogInformation(
            "BaseReportGenerator: Generated {ReportType} ({Format}) for org {OrgId}. Pages={PageCount} Size={Size}",
            job.ReportType, job.Format, job.OrgId, pageCount, fileBytes.Length);

        return new ReportGenerationResult(gcsUri, sha256Hex, pageCount);
    }

    /// <summary>Builds the QuestPDF document. Override for PDF reports.</summary>
    protected virtual IDocument BuildDocument(ReportJob job) =>
        throw new NotSupportedException($"{GetType().Name} does not support PDF generation.");

    /// <summary>Builds the JSON string. Override for JSON reports.</summary>
    protected virtual string BuildJson(ReportJob job) =>
        throw new NotSupportedException($"{GetType().Name} does not support JSON generation.");

    private static string BuildObjectName(ReportJob job, string extension) =>
        $"reports/{job.OrgId}/{job.ReportType}/{job.Id}.{extension}";

    private static int EstimatePageCount(byte[] pdfBytes)
    {
        // Quick heuristic: count /Page occurrences in PDF
        var pdf = System.Text.Encoding.Latin1.GetString(pdfBytes);
        return System.Text.RegularExpressions.Regex.Matches(pdf, @"/Type\s*/Page\b").Count;
    }
}
