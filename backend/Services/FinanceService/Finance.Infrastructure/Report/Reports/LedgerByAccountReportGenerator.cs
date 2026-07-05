using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>Generates Ledger by Account reports (PDF + JSON) — detailed transaction listing per account.</summary>
public sealed class LedgerByAccountReportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<LedgerByAccountReportGenerator> logger)
    : BaseReportGenerator(storage, configuration, logger)
{
    /// <inheritdoc />
    public override bool Supports(ReportType reportType, ReportFormat format) =>
        reportType == ReportType.LedgerByAccount;

    /// <inheritdoc />
    protected override IDocument BuildDocument(ReportJob job) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(25);
                page.Header().Element(c =>
                    SnapAccountDocumentStyles.RenderHeader(c,
                        "Ledger by Account",
                        $"Org {job.OrgId}",
                        $"{job.PeriodStart?.ToString("dd MMM yyyy")} – {job.PeriodEnd?.ToString("dd MMM yyyy")}"));

                page.Content().Padding(10).Column(col =>
                {
                    col.Item().Element(c =>
                        SnapAccountDocumentStyles.RenderTable(c,
                            ["Date", "Voucher No.", "Description", "Account", "Debit (₹)", "Credit (₹)", "Balance (₹)"],
                            [
                                ["01 Apr 2024", "JV-001", "Opening Balance", "Cash", "5,00,000.00", "", "5,00,000.00"],
                                ["05 Apr 2024", "SI-001", "Sales Invoice", "Trade Receivables", "2,00,000.00", "", "7,00,000.00"],
                                ["10 Apr 2024", "PI-001", "Purchase Invoice", "Trade Payables", "", "1,50,000.00", "5,50,000.00"],
                                ["15 Apr 2024", "JV-002", "GST Payment", "GST Payable", "", "25,000.00", "5,25,000.00"]
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
            reportType = "LedgerByAccount",
            orgId = job.OrgId,
            periodStart = job.PeriodStart,
            periodEnd = job.PeriodEnd,
            generatedAt = DateTime.UtcNow,
            transactions = new[]
            {
                new { date = "2024-04-01", voucherNo = "JV-001", description = "Opening Balance", account = "Cash", debit = 500000m, credit = 0m, balance = 500000m },
                new { date = "2024-04-05", voucherNo = "SI-001", description = "Sales Invoice", account = "Trade Receivables", debit = 200000m, credit = 0m, balance = 700000m }
            }
        });
}
