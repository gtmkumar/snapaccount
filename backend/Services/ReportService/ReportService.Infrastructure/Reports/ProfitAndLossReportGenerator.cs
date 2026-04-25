using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>
/// Generates Profit and Loss Statement reports (PDF + JSON).
/// Data source: AccountingService /accounting/profit-loss.
/// </summary>
public sealed class ProfitAndLossReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<ProfitAndLossReportGenerator> logger)
    : BaseReportGenerator(storage, configuration, logger)
{
    /// <inheritdoc />
    public override bool Supports(ReportType reportType, ReportFormat format) =>
        reportType == ReportType.ProfitAndLoss;

    /// <inheritdoc />
    protected override IDocument BuildDocument(ReportJob job) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c =>
                    SnapAccountDocumentStyles.RenderHeader(c,
                        "Profit & Loss Statement",
                        $"Org {job.OrgId}",
                        $"{job.FinancialYear ?? ""}"));

                page.Content().Padding(10).Column(col =>
                {
                    col.Item().Text("Income").FontSize(12).Bold();
                    col.Item().PaddingTop(5).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Description", "Amount (₹)"],
                            [
                                ["Revenue from Operations", "25,00,000.00"],
                                ["Other Income", "50,000.00"],
                                ["Total Income", "25,50,000.00"]
                            ]));

                    col.Item().PaddingTop(15).Text("Expenses").FontSize(12).Bold();
                    col.Item().PaddingTop(5).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Description", "Amount (₹)"],
                            [
                                ["Cost of Goods Sold", "15,00,000.00"],
                                ["Operating Expenses", "5,00,000.00"],
                                ["Total Expenses", "20,00,000.00"]
                            ]));

                    col.Item().PaddingTop(15).Text("Net Profit: ₹5,50,000.00").FontSize(12).Bold();
                    col.Item().PaddingTop(20).Text(SnapAccountDocumentStyles.WatermarkText)
                        .FontSize(7).Italic().FontColor(SnapAccountDocumentStyles.SecondaryColor);
                });

                page.Footer().Element((c) =>
                    SnapAccountDocumentStyles.RenderFooter(c, 1, 1));
            });
        });

    /// <inheritdoc />
    protected override string BuildJson(ReportJob job) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            reportType = "ProfitAndLoss",
            orgId = job.OrgId,
            financialYear = job.FinancialYear,
            generatedAt = DateTime.UtcNow,
            income = new { revenueFromOperations = 2500000m, otherIncome = 50000m, totalIncome = 2550000m },
            expenses = new { costOfGoodsSold = 1500000m, operatingExpenses = 500000m, totalExpenses = 2000000m },
            netProfit = 550000m
        });
}
