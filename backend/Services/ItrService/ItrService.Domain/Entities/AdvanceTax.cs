using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Represents an advance tax instalment record under Section 207 of the Income Tax Act.
/// Instalment due dates: Q1 — Jun 15, Q2 — Sep 15, Q3 — Dec 15, Q4 — Mar 15.
/// </summary>
public class AdvanceTax : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }

    /// <summary>Assessment year, e.g. "2025-26".</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>Q1 | Q2 | Q3 | Q4</summary>
    public string Installment { get; private set; } = string.Empty;

    public DateTime DueDate { get; private set; }
    public decimal EstimatedIncome { get; private set; }
    public decimal TaxLiability { get; private set; }
    public decimal PaidAmount { get; private set; }
    public decimal? ChallanAmount { get; private set; }
    public string? ChallanNumber { get; private set; }

    /// <summary>Bank Serial Number — 7-digit BSR code of the bank branch.</summary>
    public string? BsrCode { get; private set; }

    public DateTime? PaidAt { get; private set; }

    /// <summary>PENDING | PARTIALLY_PAID | PAID | OVERDUE</summary>
    public string Status { get; private set; } = "PENDING";

    /// <summary>Interest under Section 234B (non-payment/short-payment of advance tax).</summary>
    public decimal? InterestU234B { get; private set; }

    /// <summary>Interest under Section 234C (deferment of advance tax instalment).</summary>
    public decimal? InterestU234C { get; private set; }

    public string? Notes { get; private set; }

    private AdvanceTax() { }

    /// <summary>
    /// Creates a new advance tax instalment record in PENDING status.
    /// </summary>
    public static AdvanceTax Create(
        Guid userId,
        Guid? organizationId,
        string assessmentYear,
        string installment,
        DateTime dueDate,
        decimal taxLiability)
    {
        return new AdvanceTax
        {
            UserId = userId,
            OrganizationId = organizationId,
            AssessmentYear = assessmentYear,
            Installment = installment,
            DueDate = dueDate,
            TaxLiability = taxLiability,
            EstimatedIncome = 0,
            PaidAmount = 0,
            Status = "PENDING"
        };
    }
}
