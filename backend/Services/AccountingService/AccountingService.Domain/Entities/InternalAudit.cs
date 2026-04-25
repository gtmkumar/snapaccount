using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// Represents an internal audit engagement. Tracks the audit lifecycle from planning
/// through report issuance, including findings aggregates and auditor details.
/// </summary>
public class InternalAudit : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }
    public string AuditTitle { get; private set; } = string.Empty;

    /// <summary>FINANCIAL | OPERATIONAL | COMPLIANCE | IT | SPECIAL_PURPOSE</summary>
    public string AuditType { get; private set; } = "FINANCIAL";

    public string FinancialYear { get; private set; } = string.Empty;
    public string? AuditScope { get; private set; }

    /// <summary>PLANNED | IN_PROGRESS | COMPLETED | REPORT_ISSUED</summary>
    public string Status { get; private set; } = "PLANNED";

    public DateTime? StartDate { get; private set; }
    public DateTime? EndDate { get; private set; }
    public string? AuditorName { get; private set; }
    public string? AuditorFirmName { get; private set; }
    public int FindingsCount { get; private set; }
    public int CriticalFindingsCount { get; private set; }
    public string? ExecutiveSummary { get; private set; }

    /// <summary>Reference to the report document stored in GCS.</summary>
    public string? ReportDocumentId { get; private set; }

    public DateTime? ReportIssuedAt { get; private set; }
    public string? Notes { get; private set; }

    private InternalAudit() { }

    /// <summary>
    /// Creates a new internal audit engagement in PLANNED status.
    /// </summary>
    public static InternalAudit Create(
        Guid userId,
        Guid? organizationId,
        string auditTitle,
        string auditType,
        string financialYear)
    {
        return new InternalAudit
        {
            UserId = userId,
            OrganizationId = organizationId,
            AuditTitle = auditTitle,
            AuditType = auditType,
            FinancialYear = financialYear,
            Status = "PLANNED",
            FindingsCount = 0,
            CriticalFindingsCount = 0
        };
    }
}
