using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class DocumentArchive : BaseAuditableEntity
{
    public Guid DocumentId { get; private set; }
    public DateTime DocumentAt { get; private set; }
    public string ArchiveStoragePath { get; private set; } = string.Empty;
    public DateTime ArchivedAt { get; private set; } = DateTime.UtcNow;
    public DateTime PurgeAfter { get; private set; } // 7 years from upload
    public bool IsPurged { get; private set; }
    public DateTime? PurgedAt { get; private set; }

    private DocumentArchive() { }

    public static DocumentArchive Create(Guid documentId, DateTime documentAt, string archivePath)
        => new()
        {
            DocumentId = documentId,
            DocumentAt = documentAt,
            ArchiveStoragePath = archivePath,
            PurgeAfter = documentAt.AddYears(7)
        };

    public void MarkPurged() { IsPurged = true; PurgedAt = DateTime.UtcNow; }
}
