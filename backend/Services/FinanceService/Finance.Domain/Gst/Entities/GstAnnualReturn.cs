using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Represents a GST annual return filing — GSTR-9 (regular), GSTR-9A (composition),
/// or GSTR-9C (reconciliation statement / audit).
/// </summary>
public class GstAnnualReturn : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }

    /// <summary>Financial year, e.g. "2024-25".</summary>
    public string FinancialYear { get; private set; } = string.Empty;

    /// <summary>GSTR9 | GSTR9A | GSTR9C</summary>
    public string FormType { get; private set; } = "GSTR9";

    public decimal? TotalTurnover { get; private set; }
    public decimal? TotalTaxPaid { get; private set; }
    public decimal? TotalItcClaimed { get; private set; }

    /// <summary>DRAFT | IN_PROGRESS | FILED | ACCEPTED | REJECTED</summary>
    public string Status { get; private set; } = "DRAFT";

    public string? ArnNumber { get; private set; }
    public DateTime? FiledAt { get; private set; }
    public string? Notes { get; private set; }
    public bool IsReconciled { get; private set; }
    public DateTime? ReconciledAt { get; private set; }

    private GstAnnualReturn() { }

    /// <summary>
    /// Creates a new GST annual return in DRAFT status.
    /// </summary>
    public static GstAnnualReturn Create(
        Guid userId,
        Guid? organizationId,
        string financialYear,
        string formType)
    {
        return new GstAnnualReturn
        {
            UserId = userId,
            OrganizationId = organizationId,
            FinancialYear = financialYear,
            FormType = formType,
            Status = "DRAFT",
            IsReconciled = false
        };
    }
}
