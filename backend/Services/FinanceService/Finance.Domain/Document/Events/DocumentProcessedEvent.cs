using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Events;

public sealed record DocumentProcessedEvent(Guid DocumentId, Guid UserId) : DomainEvent;
