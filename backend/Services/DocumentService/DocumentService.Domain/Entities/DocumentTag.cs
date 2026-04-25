using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class DocumentTag : BaseAuditableEntity
{
    public Guid DocumentId { get; private set; }
    public DateTime DocumentAt { get; private set; }
    public string TagName { get; private set; } = string.Empty;
    public Guid CreatedByUserId { get; private set; }

    private DocumentTag() { }

    public static DocumentTag Create(Guid documentId, DateTime documentAt, string tagName, Guid createdByUserId)
        => new() { DocumentId = documentId, DocumentAt = documentAt, TagName = tagName, CreatedByUserId = createdByUserId };
}
