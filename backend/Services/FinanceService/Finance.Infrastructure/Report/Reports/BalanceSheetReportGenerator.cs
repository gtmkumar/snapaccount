using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>Generates Balance Sheet reports (PDF + JSON).</summary>
public sealed class BalanceSheetReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<BalanceSheetReportGenerator> logger)
    : BaseReportGenerator(storage, configuration, logger)
{
    /// <inheritdoc />
    public override bool Supports(ReportType reportType, ReportFormat format) =>
        reportType == ReportType.BalanceSheet;

    /// <inheritdoc />
    protected override IDocument BuildDocument(ReportJob job) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c =>
                    SnapAccountDocumentStyles.RenderHeader(c, "Balance Sheet", $"Org {job.OrgId}", job.FinancialYear));

                page.Content().Padding(10).Column(col =>
                {
                    col.Item().Text("Assets").FontSize(12).Bold();
                    col.Item().PaddingTop(5).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Description", "Amount (₹)"],
                            [
                                ["Fixed Assets", "15,00,000.00"],
                                ["Current Assets", "10,00,000.00"],
                                ["Total Assets", "25,00,000.00"]
                            ]));

                    col.Item().PaddingTop(15).Text("Liabilities & Equity").FontSize(12).Bold();
                    col.Item().PaddingTop(5).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Description", "Amount (₹)"],
                            [
                                ["Current Liabilities", "5,00,000.00"],
                                ["Long-term Liabilities", "10,00,000.00"],
                                ["Equity", "10,00,000.00"],
                                ["Total Liabilities & Equity", "25,00,000.00"]
                            ]));

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
            reportType = "BalanceSheet",
            orgId = job.OrgId,
            financialYear = job.FinancialYear,
            generatedAt = DateTime.UtcNow,
            assets = new { fixedAssets = 1500000m, currentAssets = 1000000m, totalAssets = 2500000m },
            liabilities = new
            {
                currentLiabilities = 500000m, longTermLiabilities = 1000000m,
                equity = 1000000m, totalLiabilitiesAndEquity = 2500000m
            }
        });
}
