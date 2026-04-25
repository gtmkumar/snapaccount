using Google.Cloud.PubSub.V1;
using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Google.Protobuf;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// Adapts Google Cloud Pub/Sub for use as ILoanEventPublisher in LoanService.
/// Accepts plain object payloads (no IDomainEvent constraint needed for loan domain events).
/// </summary>
public sealed class GooglePubSubPublisherAdapter(
    IConfiguration configuration,
    ILogger<GooglePubSubPublisherAdapter> logger) : ILoanEventPublisher
{
    /// <inheritdoc />
    public async Task PublishAsync(string topicId, object payload, CancellationToken ct = default)
    {
        var projectId = configuration["GCP_PROJECT_ID"];
        if (string.IsNullOrWhiteSpace(projectId))
        {
            logger.LogWarning(
                "GooglePubSubPublisherAdapter: GCP_PROJECT_ID not configured. Event {Topic} not published.",
                topicId);
            return;
        }

        try
        {
            var topicName = TopicName.FromProjectTopic(projectId, topicId);
            var publisherClient = await PublisherClient.CreateAsync(topicName);
            var json = JsonSerializer.Serialize(payload);
            var message = new PubsubMessage
            {
                Data = ByteString.CopyFromUtf8(json)
            };
            await publisherClient.PublishAsync(message);
            await publisherClient.ShutdownAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "GooglePubSubPublisherAdapter: Failed to publish to topic {TopicId}", topicId);
        }
    }
}
