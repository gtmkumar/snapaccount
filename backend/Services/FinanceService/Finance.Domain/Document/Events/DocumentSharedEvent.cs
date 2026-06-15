using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Events;

public sealed record DocumentSharedEvent(Guid DocumentId, Guid SharedBy, string ShareType) : DomainEvent;
