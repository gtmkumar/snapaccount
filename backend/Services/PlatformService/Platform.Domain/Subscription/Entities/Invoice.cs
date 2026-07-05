using SnapAccount.Shared.Domain;

namespace SubscriptionService.Domain.Entities;

/// <summary>
/// An invoice generated for a subscription billing event.
/// Stores amount in INR (decimal — never float/double).
/// </summary>
public class Invoice : BaseAuditableEntity
{
    /// <summary>Parent subscription.</summary>
    public Guid SubscriptionId { get; private set; }

    /// <summary>Organisation this invoice belongs to.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>Invoice number (human-readable, sequential per org).</summary>
    public string InvoiceNumber { get; private set; } = string.Empty;

    /// <summary>Total amount in INR.</summary>
    public decimal AmountInr { get; private set; }

    /// <summary>GST amount (18% on SaaS services).</summary>
    public decimal GstAmountInr { get; private set; }

    /// <summary>Billing period start.</summary>
    public DateTime PeriodStart { get; private set; }

    /// <summary>Billing period end.</summary>
    public DateTime PeriodEnd { get; private set; }

    /// <summary>Payment status: PENDING | PAID | FAILED | REFUNDED.</summary>
    public string Status { get; private set; } = "PENDING";

    /// <summary>Razorpay payment ID (set after webhook).</summary>
    public string? RazorpayPaymentId { get; private set; }

    /// <summary>Razorpay order ID.</summary>
    public string? RazorpayOrderId { get; private set; }

    /// <summary>GCS URI for the generated PDF invoice.</summary>
    public string? PdfGcsUri { get; private set; }

    /// <summary>When payment was received.</summary>
    public DateTime? PaidAt { get; private set; }

    private Invoice() { }

    /// <summary>Creates a new pending invoice.</summary>
    public static Invoice Create(
        Guid subscriptionId,
        Guid organizationId,
        string invoiceNumber,
        decimal amountInr,
        decimal gstAmountInr,
        DateTime periodStart,
        DateTime periodEnd,
        string? razorpayOrderId = null)
        => new()
        {
            SubscriptionId = subscriptionId,
            OrganizationId = organizationId,
            InvoiceNumber = invoiceNumber,
            AmountInr = amountInr,
            GstAmountInr = gstAmountInr,
            PeriodStart = periodStart,
            PeriodEnd = periodEnd,
            Status = "PENDING",
            RazorpayOrderId = razorpayOrderId
        };

    /// <summary>Marks invoice as paid after successful payment webhook.</summary>
    public void MarkPaid(string razorpayPaymentId)
    {
        Status = "PAID";
        RazorpayPaymentId = razorpayPaymentId;
        PaidAt = DateTime.UtcNow;
    }

    /// <summary>Marks invoice as failed.</summary>
    public void MarkFailed() => Status = "FAILED";

    /// <summary>
    /// DG-SUB-11: Marks invoice as refunded.
    /// Can only be applied to a PAID invoice.
    /// </summary>
    /// <param name="refundReason">Human-readable reason for the refund.</param>
    public void MarkRefunded(string? refundReason = null)
    {
        if (Status != "PAID")
            throw new InvalidOperationException($"Only PAID invoices can be refunded. Current status: {Status}.");
        Status = "REFUNDED";
        RefundedAt = DateTime.UtcNow;
        RefundReason = refundReason;
    }

    /// <summary>
    /// DG-SUB-11: Voids a PENDING invoice (e.g. when subscription is cancelled before payment).
    /// Cannot void a PAID or already-REFUNDED invoice.
    /// </summary>
    public void Void()
    {
        if (Status is "PAID" or "REFUNDED")
            throw new InvalidOperationException($"A {Status} invoice cannot be voided.");
        Status = "VOID";
        VoidedAt = DateTime.UtcNow;
    }

    /// <summary>DG-SUB-11: Timestamp when invoice was refunded.</summary>
    public DateTime? RefundedAt { get; private set; }

    /// <summary>DG-SUB-11: Human-readable reason for the refund.</summary>
    public string? RefundReason { get; private set; }

    /// <summary>DG-SUB-11: Timestamp when invoice was voided.</summary>
    public DateTime? VoidedAt { get; private set; }

    /// <summary>Sets the GCS URI for the PDF invoice.</summary>
    public void SetPdfGcsUri(string gcsUri) => PdfGcsUri = gcsUri;

    // ── DPDP Act 2023 ─────────────────────────────────────────────────────────

    /// <summary>DPDP: timestamp of user-data anonymization.</summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>DPDP: reason for anonymization.</summary>
    public string? AnonymizationReason { get; private set; }

    /// <summary>
    /// DPDP Act 2023 (SEC-052): anonymize on user erasure.
    /// Nulls OrganizationId reference (set to Guid.Empty) and records reason.
    /// Does NOT hard-delete (RBI compliance retention: 7 years).
    /// </summary>
    public void Anonymize(string reason = "DPDP_USER_ERASURE")
    {
        OrganizationId = Guid.Empty;
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
