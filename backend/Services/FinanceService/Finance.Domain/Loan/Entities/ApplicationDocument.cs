using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// Associates an uploaded document with a loan application.
///
/// P6-HANDOFF-29: document_id is a LOGICAL FK to document.documents (partitioned table).
/// No DB constraint enforces referential integrity — handlers must validate existence
/// by calling DocumentService or the document DbContext directly.
/// </summary>
public class ApplicationDocument : BaseAuditableEntity
{
    /// <summary>FK to loan.applications.</summary>
    public Guid ApplicationId { get; init; }

    /// <summary>Logical reference to document.documents (no DB FK — partitioned table).</summary>
    public Guid DocumentId { get; init; }

    /// <summary>Type of document.</summary>
    public ApplicationDocumentType DocumentType { get; init; }

    /// <summary>Review status of this document.</summary>
    public DocumentStatus Status { get; set; } = DocumentStatus.Pending;

    /// <summary>Reviewer notes.</summary>
    public string? ReviewNotes { get; set; }
}

/// <summary>Document types required for loan applications.</summary>
public enum ApplicationDocumentType
{
    Pan,
    Aadhaar,
    Gstr3B,
    ProfitAndLoss,
    BalanceSheet,
    BankStatement,
    Itr,
    TradeLicense,
    Other
}

/// <summary>Document review status.</summary>
public enum DocumentStatus
{
    Pending,
    Approved,
    Rejected,
    Expired
}
