using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// Stub implementation of ILoanPdfGenerator for use in LoanService.
/// The real QuestPDF implementation lives in ReportService.Infrastructure.
/// This stub generates a placeholder PDF so LoanService can compile and run independently.
///
/// In production, the GeneratePackageCommand should call ReportService's HTTP endpoint
/// to generate the PDF, or use the shared QuestPDF implementation.
/// </summary>
public sealed class StubLoanPdfGenerator(ILogger<StubLoanPdfGenerator> logger) : ILoanPdfGenerator
{
    /// <inheritdoc />
    public Task<(byte[] PdfBytes, byte[] Sha256Hash, int PageCount)> GenerateAsync(
        Guid applicationId,
        Guid orgId,
        string orgName,
        CancellationToken ct)
    {
        logger.LogWarning(
            "StubLoanPdfGenerator: Generating stub PDF for application {AppId}. " +
            "Wire to ReportService QuestPDF implementation in production.",
            applicationId);

        // Generate a minimal placeholder PDF byte sequence
        var content = $"STUB PDF - Application: {applicationId} - Org: {orgName} - Generated: {DateTime.UtcNow:O}";
        var bytes = Encoding.UTF8.GetBytes(content);
        var hash = SHA256.HashData(bytes);

        return Task.FromResult((bytes, hash, 1));
    }
}
