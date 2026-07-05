namespace SubscriptionService.Application.Common.Interfaces;

/// <summary>
/// Generates a PDF for a subscription invoice and uploads it to GCS.
/// DG-SUB-07: Invoice PDF generation using QuestPDF.
/// </summary>
public interface ISubscriptionPdfGenerator
{
    /// <summary>
    /// Generates a PDF invoice, uploads it to GCS, and returns the public GCS URI.
    /// </summary>
    /// <param name="dto">Invoice data required for PDF rendering.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>GCS URI of the uploaded PDF (e.g. gs://bucket/subscriptions/invoices/{id}.pdf).</returns>
    Task<string> GenerateAndUploadAsync(InvoicePdfDto dto, CancellationToken ct = default);
}

/// <summary>Data required to generate a subscription invoice PDF.</summary>
public sealed record InvoicePdfDto(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid OrganizationId,
    string OrganizationName,
    string? OrgGstin,
    string PlanName,
    string PlanTier,
    decimal AmountInr,
    decimal GstAmountInr,
    decimal TotalInr,
    DateTime PeriodStart,
    DateTime PeriodEnd,
    string Status,
    DateTime? PaidAt,
    DateTime GeneratedAt);
