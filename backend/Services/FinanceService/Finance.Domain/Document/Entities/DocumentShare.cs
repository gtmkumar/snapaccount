using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class DocumentShare : BaseAuditableEntity
{
    public Guid DocumentId { get; private set; }
    public DateTime DocumentAt { get; private set; }
    public Guid SharedBy { get; private set; }
    public Guid? SharedWith { get; private set; }
    public string ShareType { get; private set; } = string.Empty; // CA, BANK, USER, EXTERNAL_LINK
    public string? ExternalEmail { get; private set; }
    public string? AccessToken { get; private set; }
    public DateTime? ExpiresAt { get; private set; }
    public bool IsRevoked { get; private set; }
    public DateTime? RevokedAt { get; private set; }
    public DateTime? AccessedAt { get; private set; }

    private DocumentShare() { }

    public static DocumentShare Create(Guid documentId, DateTime documentAt, Guid sharedBy,
        string shareType, Guid? sharedWith = null, string? externalEmail = null, DateTime? expiresAt = null)
        => new()
        {
            DocumentId = documentId,
            DocumentAt = documentAt,
            SharedBy = sharedBy,
            ShareType = shareType,
            SharedWith = sharedWith,
            ExternalEmail = externalEmail,
            ExpiresAt = expiresAt,
            AccessToken = shareType == "EXTERNAL_LINK" ? Guid.NewGuid().ToString("N") : null
        };

    public void Revoke() { IsRevoked = true; RevokedAt = DateTime.UtcNow; }
    public void RecordAccess() => AccessedAt = DateTime.UtcNow;
}
