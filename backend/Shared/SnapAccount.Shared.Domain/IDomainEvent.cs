using MediatR;

namespace SnapAccount.Shared.Domain;

public interface IDomainEvent : INotification
{
    Guid EventId { get; }
    DateTime OccurredAt { get; }
}
