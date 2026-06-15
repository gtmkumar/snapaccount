using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// No-op <see cref="IPubSubPublisher"/> for local dev when GCP/Pub/Sub is disabled.
/// Logs the event instead of publishing. NEVER registered in staging/production.
/// </summary>
public sealed class NoOpPubSubPublisher(ILogger<NoOpPubSubPublisher> logger) : IPubSubPublisher
{
    public Task PublishAsync<TEvent>(string topicName, TEvent domainEvent, CancellationToken ct = default)
        where TEvent : IDomainEvent
    {
        logger.LogInformation(
            "NO-OP Pub/Sub (dev): would publish {EventType} to {Topic} — GCP disabled.",
            typeof(TEvent).Name, topicName);
        return Task.CompletedTask;
    }
}
