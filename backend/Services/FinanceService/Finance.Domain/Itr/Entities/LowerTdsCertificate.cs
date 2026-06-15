using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Represents a lower/nil TDS deduction certificate issued under Section 197 or 195
/// of the Income Tax Act, allowing the holder to receive income with reduced TDS.
/// </summary>
public class LowerTdsCertificate : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }

    /// <summary>Assessment year, e.g. "2025-26".</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>Section 197 (resident) or 195 (non-resident).</summary>
    public string Section { get; private set; } = string.Empty;

    public string? DeductorName { get; private set; }

    /// <summary>Tax Deduction and Collection Account Number (TAN) of the deductor.</summary>
    public string? DeductorTan { get; private set; }

    public decimal EstimatedIncome { get; private set; }
    public decimal EstimatedTaxLiability { get; private set; }

    /// <summary>Applicable TDS rate as per the certificate (percentage).</summary>
    public decimal? CertificateRate { get; private set; }

    public string? CertificateNumber { get; private set; }
    public DateTime? ValidFrom { get; private set; }
    public DateTime? ValidTo { get; private set; }

    /// <summary>DRAFT | APPLIED | ISSUED | EXPIRED | CANCELLED</summary>
    public string Status { get; private set; } = "DRAFT";

    public string? ApplicationNumber { get; private set; }
    public DateTime? ApplicationDate { get; private set; }
    public string? Notes { get; private set; }

    private LowerTdsCertificate() { }

    /// <summary>
    /// Creates a new lower TDS certificate application in DRAFT status.
    /// </summary>
    public static LowerTdsCertificate Create(
        Guid userId,
        Guid? organizationId,
        string assessmentYear,
        string section,
        decimal estimatedIncome,
        decimal estimatedTaxLiability)
    {
        return new LowerTdsCertificate
        {
            UserId = userId,
            OrganizationId = organizationId,
            AssessmentYear = assessmentYear,
            Section = section,
            EstimatedIncome = estimatedIncome,
            EstimatedTaxLiability = estimatedTaxLiability,
            Status = "DRAFT"
        };
    }
}
