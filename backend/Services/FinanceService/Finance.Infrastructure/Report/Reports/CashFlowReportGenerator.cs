using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>Generates Cash Flow Statement reports (PDF + JSON).</summary>
public sealed class CashFlowReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<CashFlowReportGenerator> logger)
    : BaseReportGenerator(storage, configuration, logger)
{
    /// <inheritdoc />
    public override bool Supports(ReportType reportType, ReportFormat format) =>
        reportType == ReportType.CashFlow;

    /// <inheritdoc />
    protected override IDocument BuildDocument(ReportJob job) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c =>
                    SnapAccountDocumentStyles.RenderHeader(c, "Cash Flow Statement", $"Org {job.OrgId}", job.FinancialYear));

                page.Content().Padding(10).Column(col =>
                {
                    col.Item().Text("Operating Activities").FontSize(12).Bold();
                    col.Item().PaddingTop(5).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Description", "Amount (₹)"],
                            [
                                ["Net Profit", "5,50,000.00"],
                                ["Add: Depreciation", "1,00,000.00"],
                                ["Changes in Working Capital", "-50,000.00"],
                                ["Net Cash from Operating", "6,00,000.00"]
                            ]));

                    col.Item().PaddingTop(15).Text("Investing Activities").FontSize(12).Bold();
                    col.Item().PaddingTop(5).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Description", "Amount (₹)"],
                            [
                                ["Purchase of Fixed Assets", "-2,00,000.00"],
                                ["Net Cash from Investing", "-2,00,000.00"]
                            ]));

                    col.Item().PaddingTop(15).Text("Net Change in Cash: ₹4,00,000.00").FontSize(12).Bold();
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
            reportType = "CashFlow",
            orgId = job.OrgId,
            financialYear = job.FinancialYear,
            generatedAt = DateTime.UtcNow,
            operatingActivities = new { netProfit = 550000m, depreciation = 100000m, workingCapitalChange = -50000m, netCash = 600000m },
            investingActivities = new { purchaseOfAssets = -200000m, netCash = -200000m },
            netChangeInCash = 400000m
        });
}
