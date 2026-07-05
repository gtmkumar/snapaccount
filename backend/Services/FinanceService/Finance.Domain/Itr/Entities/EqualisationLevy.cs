using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Represents an Equalisation Levy record. Two rates apply under the Finance Act 2016:
/// 6% on specified digital advertising services (Chapter VIII), and 2% on e-commerce
/// operators (Section 165A, inserted by Finance Act 2020).
/// </summary>
public class EqualisationLevy : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }
    public string FinancialYear { get; private set; } = string.Empty;

    /// <summary>DIGITAL_SERVICES (6%) | E_COMMERCE (2%)</summary>
    public string LevyType { get; private set; } = "DIGITAL_SERVICES";

    /// <summary>Applicable levy rate as a percentage (e.g. 6.00 or 2.00).</summary>
    public decimal LevyRate { get; private set; }

    public decimal GrossConsideration { get; private set; }
    public decimal LevyAmount { get; private set; }
    public string? ServiceProviderName { get; private set; }
    public string? ServiceProviderCountry { get; private set; }

    /// <summary>Q1 | Q2 | Q3 | Q4</summary>
    public string Quarter { get; private set; } = string.Empty;

    public DateTime? DueDate { get; private set; }
    public DateTime? PaidAt { get; private set; }
    public string? ChallanNumber { get; private set; }

    /// <summary>PENDING | PAID | OVERDUE | EXEMPT</summary>
    public string Status { get; private set; } = "PENDING";

    public bool IsExempt { get; private set; }
    public string? ExemptionReason { get; private set; }

    private EqualisationLevy() { }

    /// <summary>
    /// Creates a new equalisation levy record. LevyAmount is computed as
    /// GrossConsideration * LevyRate / 100.
    /// </summary>
    public static EqualisationLevy Create(
        Guid userId,
        Guid? organizationId,
        string financialYear,
        string levyType,
        string quarter,
        decimal grossConsideration,
        decimal levyRate)
    {
        var levyAmount = grossConsideration * levyRate / 100m;
        return new EqualisationLevy
        {
            UserId = userId,
            OrganizationId = organizationId,
            FinancialYear = financialYear,
            LevyType = levyType,
            LevyRate = levyRate,
            Quarter = quarter,
            GrossConsideration = grossConsideration,
            LevyAmount = levyAmount,
            Status = "PENDING",
            IsExempt = false
        };
    }
}
