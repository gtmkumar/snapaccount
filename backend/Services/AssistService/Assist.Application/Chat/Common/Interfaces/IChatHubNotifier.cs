using ChatService.Application.Threads.Commands.SendMessage;

namespace ChatService.Application.Common.Interfaces;

/// <summary>
/// Abstraction over SignalR ChatHub for broadcasting real-time events.
/// Injected into Application layer command handlers.
/// </summary>
public interface IChatHubNotifier
{
    /// <summary>Broadcasts a new message to all participants of the thread's SignalR group.</summary>
    Task NotifyMessageAsync(Guid threadId, SendMessageResponse message, CancellationToken ct = default);

    /// <summary>Broadcasts a typing indicator to a thread group.</summary>
    Task NotifyTypingAsync(Guid threadId, Guid typingUserId, CancellationToken ct = default);
}
