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
    // UPLOADED, OCR_IN_PROGRESS, OCR_COMPLETE, IN_REVIEW, PROCESSED, REJECTED, ARCHIVED
    public bool IsEncrypted { get; private set; } = true;
    public string? EncryptionKeyId { get; private set; }
    public DateTime UploadedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; private set; }
    public DateTime? ArchivedAt { get; private set; }

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

    public void Reject() => Status = "REJECTED";
}
