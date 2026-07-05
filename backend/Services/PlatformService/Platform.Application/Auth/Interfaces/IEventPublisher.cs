using SnapAccount.Shared.Domain;

namespace AuthService.Application.Interfaces;

/// <summary>
/// Abstraction over messaging infrastructure (e.g. Google Pub/Sub) for publishing domain events
/// to cross-service topics. Keeps the Application layer free of infrastructure dependencies.
/// </summary>
public interface IEventPublisher
{
    /// <summary>
    /// Publishes a domain event to the specified topic.
    /// </summary>
    /// <typeparam name="TEvent">The domain event type.</typeparam>
    /// <param name="topicName">The Pub/Sub topic name.</param>
    /// <param name="domainEvent">The event to publish.</param>
    /// <param name="ct">Cancellation token.</param>
    Task PublishAsync<TEvent>(string topicName, TEvent domainEvent, CancellationToken ct = default)
        where TEvent : IDomainEvent;
}
