using ChatService.Application.Common.Interfaces;
using ChatService.Application.Threads.Commands.SendMessage;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.SignalR;

/// <summary>
/// Implements <see cref="IChatHubNotifier"/> using SignalR IHubContext.
/// Broadcasts messages and typing indicators to thread groups.
/// </summary>
public sealed class ChatHubNotifier(
    IHubContext<ChatHub> hubContext,
    ILogger<ChatHubNotifier> logger) : IChatHubNotifier
{
    /// <inheritdoc />
    public async Task NotifyMessageAsync(
        Guid threadId,
        SendMessageResponse message,
        CancellationToken ct = default)
    {
        try
        {
            await hubContext.Clients
                .Group(ChatHub.ThreadGroupName(threadId))
                .SendAsync("ReceiveMessage", message, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ChatHubNotifier: Failed to broadcast message to thread {ThreadId}", threadId);
        }
    }

    /// <inheritdoc />
    public async Task NotifyTypingAsync(
        Guid threadId,
        Guid typingUserId,
        CancellationToken ct = default)
    {
        try
        {
            await hubContext.Clients
                .Group(ChatHub.ThreadGroupName(threadId))
                .SendAsync("UserTyping", new { ThreadId = threadId, UserId = typingUserId }, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ChatHubNotifier: Failed to broadcast typing to thread {ThreadId}", threadId);
        }
    }
}
