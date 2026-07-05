using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

public sealed record UserRegisteredEvent(Guid UserId, string PhoneNumber) : DomainEvent;
