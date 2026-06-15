using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class DocumentPage : BaseAuditableEntity
{
    public Guid DocumentId { get; private set; }
    public DateTime DocumentAt { get; private set; }
    public int PageNumber { get; private set; }
    public string StoragePath { get; private set; } = string.Empty;
    public string? ThumbnailPath { get; private set; }
    public int? WidthPx { get; private set; }
    public int? HeightPx { get; private set; }
    public long? FileSizeBytes { get; private set; }

    private DocumentPage() { }

    public static DocumentPage Create(Guid documentId, DateTime documentAt, int pageNumber, string storagePath)
        => new() { DocumentId = documentId, DocumentAt = documentAt, PageNumber = pageNumber, StoragePath = storagePath };
}
