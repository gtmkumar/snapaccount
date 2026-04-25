using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>
/// Generates Trial Balance reports (PDF + JSON).
/// Data source: cross-service HTTP call to AccountingService /accounting/trial-balance.
/// In Phase 6C: generates a structured stub with correct layout.
/// </summary>
public sealed class TrialBalanceReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<TrialBalanceReportGenerator> logger)
    : BaseReportGenerator(storage, configuration, logger)
{
    /// <inheritdoc />
    public override bool Supports(ReportType reportType, ReportFormat format) =>
        reportType == ReportType.TrialBalance;

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
                        "Trial Balance",
                        $"Org {job.OrgId}",
                        $"{job.FinancialYear ?? job.PeriodStart?.ToString("MMM yyyy") ?? ""}"));

                page.Content().Padding(10).Column(col =>
                {
                    col.Item().Text("Trial Balance")
                        .FontSize(14).Bold();
                    col.Item().PaddingTop(10).Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Account Code", "Account Name", "Debit (₹)", "Credit (₹)"],
                            [
                                ["1001", "Cash & Bank", "5,00,000.00", ""],
                                ["2001", "Accounts Payable", "", "1,50,000.00"],
                                ["3001", "Capital", "", "3,50,000.00"],
                                ["", "TOTAL", "5,00,000.00", "5,00,000.00"]
                            ]));
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
            reportType = "TrialBalance",
            orgId = job.OrgId,
            financialYear = job.FinancialYear,
            generatedAt = DateTime.UtcNow,
            accounts = new[]
            {
                new { code = "1001", name = "Cash & Bank", debit = 500000m, credit = 0m },
                new { code = "2001", name = "Accounts Payable", debit = 0m, credit = 150000m },
                new { code = "3001", name = "Capital", debit = 0m, credit = 350000m }
            }
        });
}
