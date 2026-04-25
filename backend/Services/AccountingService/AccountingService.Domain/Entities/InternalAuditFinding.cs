using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// Represents an individual finding raised during an internal audit.
/// Linked to the parent <see cref="InternalAudit"/> via <see cref="InternalAuditId"/>.
/// </summary>
public class InternalAuditFinding : BaseAuditableEntity
{
    public Guid InternalAuditId { get; private set; }

    /// <summary>CONTROL_WEAKNESS | POLICY_VIOLATION | FRAUD_RISK | PROCESS_GAP | RECOMMENDATION</summary>
    public string FindingType { get; private set; } = string.Empty;

    /// <summary>CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL</summary>
    public string Severity { get; private set; } = "MEDIUM";

    public string Title { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public string? Recommendation { get; private set; }
    public string? ManagementResponse { get; private set; }

    /// <summary>OPEN | IN_PROGRESS | RESOLVED | ACCEPTED_RISK | ESCALATED</summary>
    public string Status { get; private set; } = "OPEN";

    public DateTime? TargetResolutionDate { get; private set; }
    public DateTime? ResolvedAt { get; private set; }

    /// <summary>UserId of the person assigned to remediate this finding.</summary>
    public Guid? AssignedTo { get; private set; }

    /// <summary>Reference to the evidence document stored in GCS.</summary>
    public string? EvidenceDocumentId { get; private set; }

    private InternalAuditFinding() { }

    /// <summary>
    /// Creates a new audit finding in OPEN status.
    /// </summary>
    public static InternalAuditFinding Create(
        Guid internalAuditId,
        string findingType,
        string severity,
        string title,
        string description)
    {
        return new InternalAuditFinding
        {
            InternalAuditId = internalAuditId,
            FindingType = findingType,
            Severity = severity,
            Title = title,
            Description = description,
            Status = "OPEN"
        };
    }
}
