using SnapAccount.Shared.Domain;

namespace ReportService.Domain.Entities;

/// <summary>
/// Represents a report generation job in the report schema.
/// Tracks the lifecycle of a PDF or JSON report request from queued through completed.
/// </summary>
public sealed class ReportJob : BaseAuditableEntity
{
    /// <summary>Organisation that owns this report.</summary>
    public Guid OrgId { get; set; }

    /// <summary>
    /// User who requested the report.
    /// Maps to report.report.user_id (uuid, nullable) — stored as Guid, not string,
    /// to avoid the 42804 type mismatch that a varchar→uuid assignment triggers.
    /// </summary>
    public Guid? RequestedBy { get; set; }

    /// <summary>
    /// Human-readable title for the report.
    /// Maps to report.report.title (VARCHAR(500) NOT NULL, NO DB default).
    /// Must be set before SaveChanges — handler derives it from ReportType + FinancialYear.
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Type of report to generate.</summary>
    public ReportType ReportType { get; set; }

    /// <summary>Output format: PDF or JSON.</summary>
    public ReportFormat Format { get; set; }

    /// <summary>Report financial year (e.g., "2024-25").</summary>
    public string? FinancialYear { get; set; }

    /// <summary>Start date of the reporting period (UTC).</summary>
    public DateTime? PeriodStart { get; set; }

    /// <summary>End date of the reporting period (UTC).</summary>
    public DateTime? PeriodEnd { get; set; }

    /// <summary>Current status of the job.</summary>
    public ReportJobStatus Status { get; set; } = ReportJobStatus.Queued;

    /// <summary>GCS URI of the generated report file (set on completion).</summary>
    public string? GcsUri { get; set; }

    /// <summary>SHA-256 hash of the generated file (hex, lowercase).</summary>
    public string? Sha256HashHex { get; set; }

    /// <summary>Number of pages (PDF only).</summary>
    public int? PageCount { get; set; }

    /// <summary>Error message if status is Failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>UTC timestamp when the job started processing.</summary>
    public DateTime? StartedAt { get; set; }

    /// <summary>UTC timestamp when the job completed (success or failure).</summary>
    public DateTime? CompletedAt { get; set; }

    /// <summary>Loan application ID — used only for LoanPackage reports.</summary>
    public Guid? LoanApplicationId { get; set; }

    // Note: DeletedAt is inherited from BaseAuditableEntity — do not redeclare.
}
