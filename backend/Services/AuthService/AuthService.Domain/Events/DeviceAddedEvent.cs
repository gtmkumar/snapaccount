using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

public sealed record DeviceAddedEvent(Guid UserId, Guid DeviceEntityId, string DeviceId, string Platform) : DomainEvent;
