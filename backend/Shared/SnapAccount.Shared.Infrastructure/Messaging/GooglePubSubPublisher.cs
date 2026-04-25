using Google.Cloud.PubSub.V1;
using Google.Protobuf;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Infrastructure.Messaging;

public interface IPubSubPublisher
{
    Task PublishAsync<TEvent>(string topicName, TEvent domainEvent, CancellationToken ct = default)
        where TEvent : IDomainEvent;
}

public sealed class GooglePubSubPublisher(
    IConfiguration configuration,
    ILogger<GooglePubSubPublisher> logger) : IPubSubPublisher
{
    private readonly string _projectId = configuration["GCP:ProjectId"]
        ?? throw new InvalidOperationException("GCP:ProjectId configuration is missing.");

    public async Task PublishAsync<TEvent>(
        string topicName,
        TEvent domainEvent,
        CancellationToken ct = default)
        where TEvent : IDomainEvent
    {
        var topicName_full = new TopicName(_projectId, topicName);
        var publisher = await PublisherClient.CreateAsync(topicName_full);

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

        var messageId = await publisher.PublishAsync(message);
        logger.LogInformation(
            "Published event {EventType} with id {EventId} to topic {Topic}, messageId: {MessageId}",
            typeof(TEvent).Name, domainEvent.EventId, topicName, messageId);
    }
}
