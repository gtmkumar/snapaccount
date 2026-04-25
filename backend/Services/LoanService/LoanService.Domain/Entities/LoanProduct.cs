using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace LoanService.Domain.Entities;

/// <summary>
/// Loan product offered by a partner bank.
/// Contains eligibility criteria, amount ranges, and interest rate ranges.
/// </summary>
public class LoanProduct : BaseAuditableEntity
{
    /// <summary>FK to loan.partner_banks.</summary>
    public Guid BankId { get; init; }

    /// <summary>Human-readable product name (e.g. "MSME Business Loan").</summary>
    public string ProductName { get; set; } = string.Empty;

    /// <summary>Minimum loan amount in INR.</summary>
    public decimal MinAmount { get; set; }

    /// <summary>Maximum loan amount in INR.</summary>
    public decimal MaxAmount { get; set; }

    /// <summary>Annual interest rate lower bound (percentage).</summary>
    public decimal InterestRateMin { get; set; }

    /// <summary>Annual interest rate upper bound (percentage).</summary>
    public decimal InterestRateMax { get; set; }

    /// <summary>Loan tenure in months.</summary>
    public int TenureMonths { get; set; }

    /// <summary>Purpose categories (e.g. "WORKING_CAPITAL,EQUIPMENT").</summary>
    public string? PurposeCategories { get; set; }

    /// <summary>JSON configurable eligibility rules for this product.</summary>
    public JsonDocument? EligibilityCriteriaJsonb { get; set; }

    /// <summary>Whether this product is currently available.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Navigation to partner bank.</summary>
    public PartnerBank? Bank { get; set; }
}
