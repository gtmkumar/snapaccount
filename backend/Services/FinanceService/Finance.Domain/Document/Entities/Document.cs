using SnapAccount.Shared.Domain;
using DocumentService.Domain.Events;

namespace DocumentService.Domain.Entities;

public class Document : BaseAuditableEntity
{
    public Guid UserId { get; init; }
    public Guid? OrganizationId { get; init; }
    public Guid? CategoryId { get; set; }
    public string FileName { get; init; } = string.Empty;
    public string? OriginalFileName { get; init; }
    public string MimeType { get; init; } = string.Empty;
    public long? FileSizeBytes { get; init; }
    public string? StorageBucket { get; init; }
    public string StoragePath { get; init; } = string.Empty;
    public string? StorageUrl { get; private set; }
    public int PageCount { get; private set; } = 1;
    public DateOnly? DocumentDate { get; private set; }
    public string? VendorName { get; private set; }
    public decimal? Amount { get; private set; }
    public string Status { get; private set; } = "UPLOADED";
    // UPLOADED, OCR_IN_PROGRESS, OCR_COMPLETE, IN_REVIEW, APPROVED, PROCESSED, REJECTED, ARCHIVED
    public bool IsEncrypted { get; private set; } = true;
    public string? EncryptionKeyId { get; private set; }
    public DateTime UploadedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; private set; }
    public DateTime? ArchivedAt { get; private set; }

    /// <summary>Populated by <see cref="Reject"/> — reason the operator supplied.</summary>
    public string? RejectionReason { get; private set; }

    /// <summary>Populated by <see cref="Approve"/> — ID of the operator who approved.</summary>
    public Guid? ApprovedBy { get; private set; }

    /// <summary>Populated by <see cref="Approve"/> — UTC timestamp of approval.</summary>
    public DateTime? ApprovedAt { get; private set; }

    /// <summary>Valid inbound statuses for an operator review decision.</summary>
    private static readonly IReadOnlySet<string> ReviewableStatuses =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "OCR_COMPLETE", "IN_REVIEW" };

    public void StartOcr()
    {
        Status = "OCR_IN_PROGRESS";
    }

    public void CompleteOcr(decimal? amount, string? vendorName, DateOnly? documentDate)
    {
        Status = "OCR_COMPLETE";
        Amount = amount;
        VendorName = vendorName;
        DocumentDate = documentDate;
        AddDomainEvent(new OcrCompletedEvent(Id, UserId, OrganizationId));
    }

    public void MarkProcessed()
    {
        Status = "PROCESSED";
        ProcessedAt = DateTime.UtcNow;
        AddDomainEvent(new DocumentProcessedEvent(Id, UserId));
    }

    public void Archive()
    {
        Status = "ARCHIVED";
        ArchivedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Transitions the document to REJECTED.
    /// Valid from any non-terminal status (ARCHIVED/APPROVED are terminal).
    /// </summary>
    public void Reject(string reason)
    {
        RejectionReason = reason;
        Status = "REJECTED";
    }

    /// <summary>
    /// Approves an OCR-reviewed document and raises <see cref="DocumentApprovedEvent"/>
    /// which carries the accounting payload for AccountingService.
    /// Valid from OCR_COMPLETE or IN_REVIEW only.
    /// </summary>
    /// <param name="approvedBy">UserId of the operator performing the approval.</param>
    /// <exception cref="InvalidOperationException">Thrown when document is not in a reviewable status.</exception>
    public void Approve(Guid approvedBy)
    {
        if (!ReviewableStatuses.Contains(Status))
            throw new InvalidOperationException(
                $"Document {Id} cannot be approved from status '{Status}'. " +
                $"Valid statuses: {string.Join(", ", ReviewableStatuses)}.");

        ApprovedBy = approvedBy;
        ApprovedAt = DateTime.UtcNow;
        Status = "APPROVED";
        AddDomainEvent(new DocumentApprovedEvent(
            DocumentId: Id,
            UserId: UserId,
            OrganizationId: OrganizationId,
            ApprovedBy: approvedBy,
            TotalAmount: Amount ?? 0m,
            VendorName: VendorName,
            DocumentDate: DocumentDate ?? DateOnly.FromDateTime(UploadedAt)));
    }

    /// <summary>
    /// Requests clarification from the document owner.
    /// Can be called from any non-terminal status.
    /// </summary>
    public void RequestClarification() { /* status stays unchanged */ }
}
