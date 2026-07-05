using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Infrastructure.Services;

/// <summary>
/// DG-SUB-07: Generates a QuestPDF subscription invoice PDF and uploads it to GCS.
/// Mirrors the BaseReportGenerator pattern from Finance.Infrastructure.
/// The PDF is uploaded to the GCS bucket configured in <c>GCS:SubscriptionInvoicesBucket</c>
/// (falls back to <c>GCS:DocumentsBucket</c>, then <c>snapaccount-invoices-dev</c> for local dev).
/// </summary>
public sealed class SubscriptionInvoicePdfGenerator(
    IConfiguration configuration,
    ILogger<SubscriptionInvoicePdfGenerator> logger) : ISubscriptionPdfGenerator
{
    private static bool _licenseSet;
    private static readonly object LicenceLock = new();

    private readonly string _bucketName =
        Environment.GetEnvironmentVariable("GCS_SUBSCRIPTION_INVOICES_BUCKET")
        ?? configuration["GCS:SubscriptionInvoicesBucket"]
        ?? configuration["GCS:DocumentsBucket"]
        ?? "snapaccount-invoices-dev";

    /// <inheritdoc />
    public async Task<string> GenerateAndUploadAsync(InvoicePdfDto dto, CancellationToken ct = default)
    {
        EnsureQuestPdfLicense();

        var pdfBytes = GeneratePdfBytes(dto);

        var objectName = $"subscriptions/invoices/{dto.OrganizationId}/{dto.InvoiceId}.pdf";

        var gcsUri = await UploadToGcsAsync(pdfBytes, objectName, ct);

        logger.LogInformation(
            "Subscription invoice PDF uploaded: {InvoiceNumber} → {GcsUri} ({Size} bytes)",
            dto.InvoiceNumber, gcsUri, pdfBytes.Length);

        return gcsUri;
    }

    // ── PDF rendering ────────────────────────────────────────────────────────────

    private static byte[] GeneratePdfBytes(InvoicePdfDto dto)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(35);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Element(header => RenderHeader(header, dto));
                page.Content().Element(content => RenderContent(content, dto));
                page.Footer().Element(footer => RenderFooter(footer));
            });
        });

        return document.GeneratePdf();
    }

    private static void RenderHeader(IContainer container, InvoicePdfDto dto)
    {
        container.Padding(5).Column(col =>
        {
            col.Item().Row(row =>
            {
                // Left: SnapAccount branding
                row.RelativeItem().Column(left =>
                {
                    left.Item().Text("SnapAccount")
                        .FontSize(20).Bold().FontColor("#1A56DB");
                    left.Item().Text("Tax Invoice (Receipt of Payment)")
                        .FontSize(9).FontColor("#6B7280");
                });
                // Right: Invoice metadata
                row.ConstantItem(180).AlignRight().Column(right =>
                {
                    right.Item().Text($"Invoice: {dto.InvoiceNumber}")
                        .FontSize(11).Bold();
                    right.Item().Text($"Date: {dto.GeneratedAt:dd MMM yyyy}")
                        .FontSize(9).FontColor("#6B7280");
                    right.Item().Text($"Status: {dto.Status}")
                        .FontSize(9)
                        .FontColor(dto.Status == "PAID" ? "#059669" : "#D97706");
                });
            });

            col.Item().PaddingTop(6).LineHorizontal(1).LineColor("#1A56DB");
        });
    }

    private static void RenderContent(IContainer container, InvoicePdfDto dto)
    {
        container.PaddingTop(8).Column(col =>
        {
            // ── Billing parties ──────────────────────────────────────────────
            col.Item().Row(row =>
            {
                // From (SnapAccount)
                row.RelativeItem().Column(from =>
                {
                    from.Item().Text("From").FontSize(8).Bold().FontColor("#6B7280");
                    from.Item().Text("SnapAccount Technologies Pvt. Ltd.").Bold();
                    from.Item().Text("GSTIN: 29AAAAA0000A1Z5");  // placeholder — replace with real GSTIN
                    from.Item().Text("CIN: U72900KA2024PTC000000");
                    from.Item().Text("support@snapaccount.in");
                });

                // To (Customer)
                row.RelativeItem().Column(to =>
                {
                    to.Item().Text("Bill To").FontSize(8).Bold().FontColor("#6B7280");
                    to.Item().Text(dto.OrganizationName).Bold();
                    if (!string.IsNullOrWhiteSpace(dto.OrgGstin))
                        to.Item().Text($"GSTIN: {dto.OrgGstin}");
                    to.Item().Text($"Org ID: {dto.OrganizationId}").FontSize(7).FontColor("#9CA3AF");
                });
            });

            col.Item().PaddingTop(10).PaddingBottom(4)
                .Text("Subscription Details").Bold().FontSize(10);

            // ── Line items table ──────────────────────────────────────────────
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(cols =>
                {
                    cols.RelativeColumn(4);  // Description
                    cols.RelativeColumn(2);  // Period
                    cols.RelativeColumn(1);  // HSN
                    cols.RelativeColumn(2);  // Amount
                });

                // Table header
                var headers = new[] { "Description", "Billing Period", "SAC Code", "Amount (₹)" };
                foreach (var h in headers)
                {
                    table.Header(header =>
                        header.Cell().Background("#1A56DB").Padding(5)
                            .Text(h).FontSize(8).Bold().FontColor(Colors.White));
                }

                // Single line item
                table.Cell().Padding(5).Text($"SnapAccount {dto.PlanName} Plan ({dto.PlanTier})");
                table.Cell().Padding(5).Text(
                    $"{dto.PeriodStart:dd MMM yyyy} – {dto.PeriodEnd:dd MMM yyyy}")
                    .FontSize(8).FontColor("#6B7280");
                table.Cell().Padding(5).Text("998314"); // SAC for SaaS subscriptions (India)
                table.Cell().Padding(5).AlignRight()
                    .Text($"₹{dto.AmountInr:N2}");
            });

            // ── Tax summary ──────────────────────────────────────────────────
            col.Item().PaddingTop(8).AlignRight().Column(summary =>
            {
                summary.Item().Row(row =>
                {
                    row.ConstantItem(140).Text("Subtotal (excl. GST)").FontSize(9).FontColor("#6B7280");
                    row.ConstantItem(100).AlignRight().Text($"₹{dto.AmountInr:N2}");
                });
                summary.Item().Row(row =>
                {
                    row.ConstantItem(140).Text("GST @ 18% (SAC 998314)").FontSize(9).FontColor("#6B7280");
                    row.ConstantItem(100).AlignRight().Text($"₹{dto.GstAmountInr:N2}");
                });
                summary.Item().PaddingTop(3).LineHorizontal(1).LineColor("#D1D5DB");
                summary.Item().PaddingTop(3).Row(row =>
                {
                    row.ConstantItem(140).Text("Total").FontSize(10).Bold();
                    row.ConstantItem(100).AlignRight()
                        .Text($"₹{dto.TotalInr:N2}").Bold().FontSize(10).FontColor("#1A56DB");
                });
            });

            // ── Payment info ──────────────────────────────────────────────────
            if (dto.PaidAt.HasValue)
            {
                col.Item().PaddingTop(12).Background("#F0FDF4").Padding(6).Column(paid =>
                {
                    paid.Item().Text("Payment Confirmed").Bold().FontSize(9).FontColor("#059669");
                    paid.Item().Text($"Paid on: {dto.PaidAt.Value:dd MMM yyyy HH:mm} UTC")
                        .FontSize(8).FontColor("#6B7280");
                });
            }

            // ── Footer notes ──────────────────────────────────────────────────
            col.Item().PaddingTop(16).Text(
                "This is a computer-generated tax invoice. No signature is required. " +
                "SAC Code 998314 applies to 'Information technology services'. " +
                "GST @ 18% per Notification 47/2017-CGST(Rate). " +
                "This document serves as an official receipt for your subscription payment.")
                .FontSize(7).FontColor("#9CA3AF").Italic();
        });
    }

    private static void RenderFooter(IContainer container)
    {
        container.Padding(8).Column(col =>
        {
            col.Item().LineHorizontal(1).LineColor("#D1D5DB");
            col.Item().PaddingTop(4).Row(row =>
            {
                row.RelativeItem()
                    .Text("SnapAccount Technologies Pvt. Ltd. | Bengaluru, Karnataka | support@snapaccount.in")
                    .FontSize(7).FontColor("#9CA3AF");
                row.ConstantItem(80).AlignRight()
                    .Text(text =>
                    {
                        text.Span("Page ").FontSize(7).FontColor("#9CA3AF");
                        text.CurrentPageNumber().FontSize(7).FontColor("#9CA3AF");
                        text.Span(" of ").FontSize(7).FontColor("#9CA3AF");
                        text.TotalPages().FontSize(7).FontColor("#9CA3AF");
                    });
            });
        });
    }

    // ── GCS upload ───────────────────────────────────────────────────────────────

    private async Task<string> UploadToGcsAsync(byte[] pdfBytes, string objectName, CancellationToken ct)
    {
        var bucket = _bucketName;

        try
        {
            var storageClient = StorageClient.Create();
            using var stream = new MemoryStream(pdfBytes);
            var obj = await storageClient.UploadObjectAsync(
                bucket,
                objectName,
                "application/pdf",
                stream,
                cancellationToken: ct);
            return $"gs://{bucket}/{obj.Name}";
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "GCS upload failed for subscription invoice {ObjectName} to bucket {Bucket}. " +
                "Re-throwing so caller can treat PDF as non-fatal.",
                objectName, bucket);
            throw;
        }
    }

    // ── QuestPDF license ─────────────────────────────────────────────────────────

    /// <summary>
    /// QuestPDF Community License is sufficient for open-source / internal use.
    /// Set once per process (idempotent). Mirrors Finance.Infrastructure pattern.
    /// </summary>
    private static void EnsureQuestPdfLicense()
    {
        if (_licenseSet) return;
        lock (LicenceLock)
        {
            if (_licenseSet) return;
            QuestPDF.Settings.License = LicenseType.Community;
            _licenseSet = true;
        }
    }
}
