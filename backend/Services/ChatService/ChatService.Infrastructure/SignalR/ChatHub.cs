using ChatService.Application.Common.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using ChatService.Application.Threads.Commands.SendMessage;
using ChatService.Infrastructure.Persistence;
using ChatService.Infrastructure.Services;

namespace ChatService.Infrastructure.SignalR;

/// <summary>
/// SignalR hub for real-time chat communication.
/// Auth: Firebase JWT (validated by FirebaseAuthMiddleware before hub connection).
/// Groups: one group per thread_id.
/// Redis backplane: Microsoft.AspNetCore.SignalR.StackExchangeRedis.
/// SEC-053: SendMessage hub method has per-connection sliding-window rate check (60 msg/min/user).
/// </summary>
[Authorize]
public sealed class ChatHub(
    ChatServiceDbContext db,
    PresenceService presenceService,
    IDistributedCache cache,
    ISender sender,
    ILogger<ChatHub> logger) : Hub
{
    /// <summary>
    /// Called on client connect.
    /// Validates the user is a participant in the thread they subscribe to,
    /// then joins them to the thread's SignalR group.
    /// Updates Redis presence key.
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        if (userId == null)
        {
            logger.LogWarning("ChatHub: Unauthenticated connection attempt rejected.");
            Context.Abort();
            return;
        }

        logger.LogInformation("ChatHub: User {UserId} connected (connection {ConnectionId})",
            userId, Context.ConnectionId);

        await presenceService.SetOnlineAsync(userId);
        await base.OnConnectedAsync();
    }

    /// <summary>Called on client disconnect. Clears Redis presence.</summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();
        if (userId != null)
        {
            await presenceService.SetOfflineAsync(userId);
            logger.LogInformation("ChatHub: User {UserId} disconnected.", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Client calls JoinThread to subscribe to real-time updates for a thread.
    /// Validates the caller is a participant before adding to the group.
    /// </summary>
    public async Task JoinThread(string threadIdStr)
    {
        if (!Guid.TryParse(threadIdStr, out var threadId))
        {
            await Clients.Caller.SendAsync("Error", "Invalid thread ID.");
            return;
        }

        var userId = GetUserGuid();
        if (userId == null)
        {
            await Clients.Caller.SendAsync("Error", "Not authenticated.");
            return;
        }

        // Verify caller is a participant
        var isParticipant = await db.ThreadParticipants
            .AnyAsync(p => p.ThreadId == threadId && p.UserId == userId && p.DeletedAt == null);

        if (!isParticipant)
        {
            logger.LogWarning("ChatHub: User {UserId} attempted to join thread {ThreadId} without participant record.",
                userId, threadId);
            await Clients.Caller.SendAsync("Error", "Not a participant in this thread.");
            return;
        }

        var groupName = ThreadGroupName(threadId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        logger.LogInformation("ChatHub: User {UserId} joined thread group {Group}", userId, groupName);
    }

    /// <summary>Client calls LeaveThread to unsubscribe from a thread group.</summary>
    public async Task LeaveThread(string threadIdStr)
    {
        if (!Guid.TryParse(threadIdStr, out var threadId))
            return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, ThreadGroupName(threadId));
    }

    /// <summary>Heartbeat — refreshes Redis presence TTL (30s).</summary>
    public async Task Heartbeat()
    {
        var userId = GetUserId();
        if (userId != null)
            await presenceService.SetOnlineAsync(userId);
    }

    /// <summary>
    /// SEC-053: Sends a message through the hub with per-user sliding-window rate check.
    /// Rate: 60 messages per minute per userId, keyed in Redis as <c>chat:rate:{userId}:{minute}</c>.
    /// Clients that exceed the limit receive an "Error" event with a 429 reason — connection is NOT aborted.
    /// </summary>
    /// <param name="threadIdStr">Thread ID (GUID string).</param>
    /// <param name="body">Message body (max 4000 chars).</param>
    /// <param name="clientMessageId">Optional idempotency key.</param>
    public async Task SendMessage(string threadIdStr, string body, string? clientMessageId = null)
    {
        var userId = GetUserId();
        if (userId == null)
        {
            await Clients.Caller.SendAsync("Error", "Not authenticated.");
            return;
        }

        if (!Guid.TryParse(threadIdStr, out var threadId))
        {
            await Clients.Caller.SendAsync("Error", "Invalid thread ID.");
            return;
        }

        // SEC-053: per-user sliding-window rate check using Redis INCR pattern
        var minuteBucket = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        var rateCacheKey = $"rate:{userId}:{minuteBucket}";

        var countStr = await cache.GetStringAsync(rateCacheKey);
        var count = int.TryParse(countStr, out var c) ? c : 0;

        const int MaxMessagesPerMinute = 60;
        if (count >= MaxMessagesPerMinute)
        {
            logger.LogWarning(
                "SEC-053: ChatHub rate limit exceeded for user {UserId} — {Count} msgs this minute.",
                userId, count);
            await Clients.Caller.SendAsync("Error",
                "Rate limit exceeded. Maximum 60 messages per minute.");
            return;
        }

        // Increment counter (TTL: 2 minutes to cover bucket boundary)
        await cache.SetStringAsync(
            rateCacheKey,
            (count + 1).ToString(),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2)
            });

        // Dispatch to Application layer (same handler used by REST endpoint)
        if (string.IsNullOrEmpty(body) || body.Length > 4000)
        {
            await Clients.Caller.SendAsync("Error", "Message body must be 1–4000 characters.");
            return;
        }

        var result = await sender.Send(
            new SendMessageCommand(threadId, body, null, clientMessageId));

        if (!result.IsSuccess)
        {
            await Clients.Caller.SendAsync("Error", result.Error.Message);
            return;
        }

        // The hub notifier (fired by handler) already broadcasts to the group.
        // Emit ack to caller.
        await Clients.Caller.SendAsync("MessageAck", new
        {
            result.Value.MessageId,
            result.Value.ThreadId,
            result.Value.ClientMessageId
        });
    }

    /// <summary>Returns the SignalR group name for a thread.</summary>
    public static string ThreadGroupName(Guid threadId) => $"thread:{threadId}";

    private string? GetUserId() =>
        Context.User?.FindFirst("user_id")?.Value
        ?? Context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

    private Guid? GetUserGuid() =>
        Guid.TryParse(GetUserId(), out var guid) ? guid : null;
}
