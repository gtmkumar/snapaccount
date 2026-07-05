using ChatService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Messaging;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// DG-NOTIF-01: Pub/Sub implementation of <see cref="IChatEventPublisher"/>.
/// Publishes chat new-message events to the <c>snapaccount.chat.new-message</c> topic
/// so the NotificationService subscriber can fan-out Push/InApp alerts
/// to any offline thread participant.
///
/// This class is registered only when GCP is enabled (GcpStartup.IsEnabled).
/// Tests and local dev without GCP credentials use a no-op / null variant.
/// </summary>
public sealed class ChatEventPublisher(
    IPubSubPublisher publisher,
    ILogger<ChatEventPublisher> logger) : IChatEventPublisher
{
    /// <summary>Pub/Sub topic for chat new-message events.</summary>
    private const string TopicName = "snapaccount.chat.new-message";

    /// <inheritdoc />
    public async Task PublishNewMessageAsync(
        Guid threadId,
        Guid messageId,
        Guid senderUserId,
        Guid orgId,
        string bodySnippet,
        IReadOnlyList<Guid> recipientUserIds,
        CancellationToken ct = default)
    {
        var payload = new ChatNewMessageEvent(
            ThreadId: threadId,
            MessageId: messageId,
            SenderUserId: senderUserId,
            OrgId: orgId,
            BodySnippet: bodySnippet,
            RecipientUserIds: recipientUserIds);

        try
        {
            await publisher.PublishAsync(TopicName, payload, ct);
            logger.LogDebug(
                "ChatEventPublisher: published new-message event for thread {ThreadId} " +
                "({RecipientCount} recipients)",
                threadId, recipientUserIds.Count);
        }
        catch (Exception ex)
        {
            // Log but do not rethrow — the message was already persisted and SignalR delivered it.
            // Offline notification failure is degraded-mode, not a hard failure.
            logger.LogError(ex,
                "ChatEventPublisher: failed to publish new-message event for thread {ThreadId}. " +
                "Offline push notifications will not be delivered.",
                threadId);
        }
    }
}

/// <summary>Payload for the chat new-message Pub/Sub event.</summary>
internal sealed record ChatNewMessageEvent(
    Guid ThreadId,
    Guid MessageId,
    Guid SenderUserId,
    Guid OrgId,
    string BodySnippet,
    IReadOnlyList<Guid> RecipientUserIds) : DomainEvent;
