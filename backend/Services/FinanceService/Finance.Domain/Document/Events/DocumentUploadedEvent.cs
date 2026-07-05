using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Events;

public sealed record DocumentUploadedEvent(
    Guid DocumentId, Guid UserId, Guid? OrganizationId, string FileName, string MimeType) : DomainEvent;
