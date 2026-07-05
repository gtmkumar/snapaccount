namespace ChatService.Application.Common.Interfaces;

/// <summary>
/// Publishes cross-service chat events to the messaging infrastructure.
/// Decouples the Application layer from concrete Pub/Sub implementation.
///
/// DG-NOTIF-01: wires the "chat new message" fan-out so offline participants
/// receive a Push/InApp notification through the NotificationService pipeline.
/// </summary>
public interface IChatEventPublisher
{
    /// <summary>
    /// Publishes a new-message event so the notification fan-out can deliver
    /// Push/InApp alerts to any thread participant who is currently offline.
    /// Online participants are already served by the SignalR hub notifier.
    /// </summary>
    /// <param name="threadId">The chat thread identifier.</param>
    /// <param name="messageId">The newly created message identifier.</param>
    /// <param name="senderUserId">The user who sent the message.</param>
    /// <param name="orgId">The organisation that owns the thread.</param>
    /// <param name="bodySnippet">First 200 chars of the message body (for push preview).</param>
    /// <param name="recipientUserIds">
    /// All participant user IDs who should potentially receive the notification.
    /// The notification pipeline is responsible for excluding the sender and
    /// applying quiet-hours / preference filters.
    /// </param>
    /// <param name="ct">Cancellation token.</param>
    Task PublishNewMessageAsync(
        Guid threadId,
        Guid messageId,
        Guid senderUserId,
        Guid orgId,
        string bodySnippet,
        IReadOnlyList<Guid> recipientUserIds,
        CancellationToken ct = default);
}
