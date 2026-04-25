using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class OcrFeedback : BaseAuditableEntity
{
    public Guid OcrFieldId { get; private set; }
    public Guid DocumentId { get; private set; }
    public Guid ReportedBy { get; private set; }
    public string IssueType { get; private set; } = string.Empty;
    // WRONG_VALUE, MISSING_FIELD, WRONG_FIELD, ILLEGIBLE, FORMATTING_ERROR, OTHER
    public string? Notes { get; private set; }
    public bool IsResolved { get; private set; }
    public DateTime? ResolvedAt { get; private set; }

    private OcrFeedback() { }

    public static OcrFeedback Create(Guid ocrFieldId, Guid documentId, Guid reportedBy, string issueType, string? notes = null)
        => new()
        {
            OcrFieldId = ocrFieldId,
            DocumentId = documentId,
            ReportedBy = reportedBy,
            IssueType = issueType,
            Notes = notes
        };

    public void Resolve() { IsResolved = true; ResolvedAt = DateTime.UtcNow; }
}
