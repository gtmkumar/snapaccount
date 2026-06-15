using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Represents a GST refund application — covers excess payment, export without IGST,
/// ITC accumulation, and inverted duty structure refunds.
/// </summary>
public class GstRefund : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }

    /// <summary>EXCESS_PAYMENT | EXPORT_WITHOUT_IGST | ITC_ACCUMULATION | INVERTED_DUTY</summary>
    public string RefundType { get; private set; } = string.Empty;

    /// <summary>Tax period in format "2025-Q1".</summary>
    public string TaxPeriod { get; private set; } = string.Empty;

    public string FinancialYear { get; private set; } = string.Empty;
    public decimal ClaimedAmount { get; private set; }
    public decimal? ApprovedAmount { get; private set; }

    /// <summary>DRAFT | FILED | PROCESSING | APPROVED | REJECTED | APPEALED</summary>
    public string Status { get; private set; } = "DRAFT";

    public string? ApplicationNumber { get; private set; }
    public DateTime? FiledAt { get; private set; }
    public DateTime? ApprovedAt { get; private set; }
    public string? RejectionReason { get; private set; }
    public string? ArnNumber { get; private set; }
    public string? BankAccountNumber { get; private set; }
    public string? IfscCode { get; private set; }
    public string? Notes { get; private set; }

    private GstRefund() { }

    /// <summary>
    /// Creates a new GST refund application in DRAFT status.
    /// </summary>
    public static GstRefund Create(
        Guid userId,
        Guid? organizationId,
        string refundType,
        string taxPeriod,
        string financialYear,
        decimal claimedAmount)
    {
        return new GstRefund
        {
            UserId = userId,
            OrganizationId = organizationId,
            RefundType = refundType,
            TaxPeriod = taxPeriod,
            FinancialYear = financialYear,
            ClaimedAmount = claimedAmount,
            Status = "DRAFT"
        };
    }
}
