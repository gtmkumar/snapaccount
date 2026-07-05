using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Represents a transfer pricing report — Form 3CEB (mandatory for international
/// transactions), Master File (Rule 10DA), or Country-by-Country Report (CbCR, Rule 10DB).
/// Required for specified domestic/international transactions under Section 92E.
/// </summary>
public class TransferPricingReport : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }

    /// <summary>Assessment year, e.g. "2025-26".</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>FORM3CEB | MASTER_FILE | CBCR</summary>
    public string ReportType { get; private set; } = "FORM3CEB";

    public decimal? InternationalTransactionValue { get; private set; }
    public decimal? DomesticTransactionValue { get; private set; }

    /// <summary>Transfer pricing method: CUP | RPM | CPLM | PSM | TNMM</summary>
    public string? PricingMethod { get; private set; }

    /// <summary>Chartered Accountant certifying the report.</summary>
    public string? CaName { get; private set; }

    /// <summary>ICAI membership number of the certifying CA.</summary>
    public string? CaMembershipNumber { get; private set; }

    /// <summary>DRAFT | IN_PROGRESS | FILED</summary>
    public string Status { get; private set; } = "DRAFT";

    public DateTime? FiledAt { get; private set; }
    public string? AcknowledgementNumber { get; private set; }
    public string? Notes { get; private set; }

    private TransferPricingReport() { }

    /// <summary>
    /// Creates a new transfer pricing report in DRAFT status.
    /// </summary>
    public static TransferPricingReport Create(
        Guid userId,
        Guid? organizationId,
        string assessmentYear,
        string reportType)
    {
        return new TransferPricingReport
        {
            UserId = userId,
            OrganizationId = organizationId,
            AssessmentYear = assessmentYear,
            ReportType = reportType,
            Status = "DRAFT"
        };
    }
}
