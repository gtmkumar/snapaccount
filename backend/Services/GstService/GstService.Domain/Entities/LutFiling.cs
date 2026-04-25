using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Represents a Letter of Undertaking (LUT) filing under GST, allowing exporters
/// to export goods/services without payment of IGST.
/// </summary>
public class LutFiling : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }
    public string FinancialYear { get; private set; } = string.Empty;
    public string? LutReferenceNumber { get; private set; }
    public DateTime? FiledAt { get; private set; }
    public DateTime? ValidFrom { get; private set; }
    public DateTime? ValidTo { get; private set; }

    /// <summary>DRAFT | FILED | ACTIVE | EXPIRED</summary>
    public string Status { get; private set; } = "DRAFT";

    /// <summary>GOODS | SERVICES | BOTH</summary>
    public string ExportType { get; private set; } = "GOODS";

    public string? Notes { get; private set; }
    public bool IsAutoRenewal { get; private set; }

    private LutFiling() { }

    /// <summary>
    /// Creates a new LUT filing in DRAFT status.
    /// </summary>
    public static LutFiling Create(
        Guid userId,
        Guid? organizationId,
        string financialYear,
        string exportType)
    {
        return new LutFiling
        {
            UserId = userId,
            OrganizationId = organizationId,
            FinancialYear = financialYear,
            ExportType = exportType,
            Status = "DRAFT",
            IsAutoRenewal = false
        };
    }
}
