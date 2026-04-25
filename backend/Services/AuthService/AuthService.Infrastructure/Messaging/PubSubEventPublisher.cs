using AuthService.Application.Interfaces;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace AuthService.Infrastructure.Messaging;

/// <summary>
/// Adapts the shared <see cref="IPubSubPublisher"/> to the Application layer's
/// <see cref="IEventPublisher"/> interface, keeping Application free of infra deps.
/// </summary>
public sealed class PubSubEventPublisher(IPubSubPublisher pubSubPublisher) : IEventPublisher
{
    /// <inheritdoc />
    public Task PublishAsync<TEvent>(string topicName, TEvent domainEvent, CancellationToken ct = default)
        where TEvent : IDomainEvent
        => pubSubPublisher.PublishAsync(topicName, domainEvent, ct);
}
