using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>
/// Generates Tax Liability reports (PDF + JSON).
/// Covers GST liability breakdown by rate slab (0%, 5%, 12%, 18%, 28%).
/// </summary>
public sealed class TaxLiabilityReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<TaxLiabilityReportGenerator> logger)
    : BaseReportGenerator(storage, configuration, logger)
{
    /// <inheritdoc />
    public override bool Supports(ReportType reportType, ReportFormat format) =>
        reportType == ReportType.TaxLiability;

    /// <inheritdoc />
    protected override IDocument BuildDocument(ReportJob job) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c =>
                    SnapAccountDocumentStyles.RenderHeader(c, "GST Tax Liability Report", $"Org {job.OrgId}", job.FinancialYear));

                page.Content().Padding(10).Column(col =>
                {
                    col.Item().Text("GST Liability by Rate Slab").FontSize(12).Bold();
                    col.Item().PaddingTop(8).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["GST Rate", "Taxable Value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total Tax (₹)"],
                            [
                                ["0%", "1,00,000.00", "0.00", "0.00", "0.00", "0.00"],
                                ["5%", "5,00,000.00", "12,500.00", "12,500.00", "0.00", "25,000.00"],
                                ["12%", "3,00,000.00", "18,000.00", "18,000.00", "0.00", "36,000.00"],
                                ["18%", "8,00,000.00", "72,000.00", "72,000.00", "0.00", "1,44,000.00"],
                                ["28%", "50,000.00", "7,000.00", "7,000.00", "0.00", "14,000.00"],
                                ["TOTAL", "17,50,000.00", "1,09,500.00", "1,09,500.00", "0.00", "2,19,000.00"]
                            ]));

                    col.Item().PaddingTop(10).Text(
                        "Note: GST rates are configured values as per Government of India notifications. " +
                        "Always verify against the latest CBIC circulars.")
                        .FontSize(8).Italic().FontColor(SnapAccountDocumentStyles.WarningColor);

                    col.Item().PaddingTop(20).Text(SnapAccountDocumentStyles.WatermarkText)
                        .FontSize(7).Italic().FontColor(SnapAccountDocumentStyles.SecondaryColor);
                });

                page.Footer().Element((c) => SnapAccountDocumentStyles.RenderFooter(c, 1, 1));
            });
        });

    /// <inheritdoc />
    protected override string BuildJson(ReportJob job) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            reportType = "TaxLiability",
            orgId = job.OrgId,
            financialYear = job.FinancialYear,
            generatedAt = DateTime.UtcNow,
            slabs = new[]
            {
                new { rate = "0%", taxableValue = 100000m, cgst = 0m, sgst = 0m, igst = 0m },
                new { rate = "5%", taxableValue = 500000m, cgst = 12500m, sgst = 12500m, igst = 0m },
                new { rate = "12%", taxableValue = 300000m, cgst = 18000m, sgst = 18000m, igst = 0m },
                new { rate = "18%", taxableValue = 800000m, cgst = 72000m, sgst = 72000m, igst = 0m },
                new { rate = "28%", taxableValue = 50000m, cgst = 7000m, sgst = 7000m, igst = 0m }
            },
            totalTax = 219000m
        });
}
