using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

public sealed record OrganizationCreatedEvent(Guid OrganizationId, Guid OwnerUserId, string BusinessName) : DomainEvent;
