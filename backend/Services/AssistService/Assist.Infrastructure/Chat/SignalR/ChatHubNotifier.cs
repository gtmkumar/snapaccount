using ChatService.Application.Common.Interfaces;
using ChatService.Application.Threads.Commands.SendMessage;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.SignalR;

/// <summary>
/// Implements <see cref="IChatHubNotifier"/> using SignalR IHubContext.
/// Broadcasts messages and typing indicators to thread groups.
/// DG-INFRA-06: increments <see cref="SignalRMetrics.FanOutFailures"/> when a Group SendAsync throws.
/// </summary>
public sealed class ChatHubNotifier(
    IHubContext<ChatHub> hubContext,
    SignalRMetrics metrics,
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
            // DG-INFRA-06: count fan-out failures per observability-slos.md line 142
            metrics.FanOutFailures.Add(1, new("event", "ReceiveMessage"), new("thread_id", threadId.ToString()));
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
            // DG-INFRA-06: count fan-out failures per observability-slos.md line 142
            metrics.FanOutFailures.Add(1, new("event", "UserTyping"), new("thread_id", threadId.ToString()));
            logger.LogError(ex, "ChatHubNotifier: Failed to broadcast typing to thread {ThreadId}", threadId);
        }
    }
}
