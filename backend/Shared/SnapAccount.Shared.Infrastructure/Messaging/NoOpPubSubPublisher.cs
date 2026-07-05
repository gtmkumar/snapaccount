using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Infrastructure.Messaging;

/// <summary>
/// No-op <see cref="IPubSubPublisher"/> for local dev when GCP/Pub/Sub is disabled
/// (see <c>GcpStartup.IsEnabled</c>). Logs the event instead of publishing so that
/// commands whose handlers depend on <see cref="IPubSubPublisher"/> (e.g. OTP verify
/// publishing <c>UserRegisteredEvent</c>) work offline without a GCP project.
/// NEVER registered in staging/production — there <see cref="GooglePubSubPublisher"/> is used.
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
