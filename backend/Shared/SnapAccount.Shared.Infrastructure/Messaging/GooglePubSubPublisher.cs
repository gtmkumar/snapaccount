using System.Collections.Concurrent;
using Google.Cloud.PubSub.V1;
using Google.Protobuf;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Resilience;

namespace SnapAccount.Shared.Infrastructure.Messaging;

public interface IPubSubPublisher
{
    Task PublishAsync<TEvent>(string topicName, TEvent domainEvent, CancellationToken ct = default)
        where TEvent : IDomainEvent;
}

public sealed class GooglePubSubPublisher(
    IConfiguration configuration,
    ILogger<GooglePubSubPublisher> logger,
    IExternalCallGuard? guard = null) : IPubSubPublisher
{
    private readonly string _projectId = configuration["GCP:ProjectId"]
        ?? throw new InvalidOperationException("GCP:ProjectId configuration is missing.");

    // One PublisherClient (gRPC channel) per topic for the process lifetime —
    // creating a client per publish leaks channels and adds connection latency.
    private readonly ConcurrentDictionary<string, Task<PublisherClient>> _publishers = new();

    public async Task PublishAsync<TEvent>(
        string topicName,
        TEvent domainEvent,
        CancellationToken ct = default)
        where TEvent : IDomainEvent
    {
        var messageJson = JsonSerializer.Serialize(domainEvent, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        var message = new PubsubMessage
        {
            Data = ByteString.CopyFromUtf8(messageJson),
            Attributes =
            {
                ["eventType"] = typeof(TEvent).Name,
                ["eventId"] = domainEvent.EventId.ToString(),
                ["occurredAt"] = domainEvent.OccurredAt.ToString("O")
            }
        };

        // Guarded so a Pub/Sub outage trips a circuit breaker and fails fast
        // instead of stalling every publishing request thread.
        var messageId = guard is null
            ? await PublishCoreAsync(topicName, message)
            : await guard.ExecuteAsync("pubsub", _ => PublishCoreAsync(topicName, message), ct);

        logger.LogInformation(
            "Published event {EventType} with id {EventId} to topic {Topic}, messageId: {MessageId}",
            typeof(TEvent).Name, domainEvent.EventId, topicName, messageId);
    }

    private async Task<string> PublishCoreAsync(string topicName, PubsubMessage message)
    {
        var publisherTask = _publishers.GetOrAdd(
            topicName,
            topic => PublisherClient.CreateAsync(new TopicName(_projectId, topic)));

        PublisherClient publisher;
        try
        {
            publisher = await publisherTask;
        }
        catch
        {
            // Never cache a failed client creation — the next publish retries it.
            _publishers.TryRemove(topicName, out _);
            throw;
        }

        return await publisher.PublishAsync(message);
    }
}
