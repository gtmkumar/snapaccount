using ChatService.Application.Dashboard.Queries.GetQueueSnapshot;
using ChatService.Application.Dashboard.Queries.GetWorkloadByUser;
using ChatService.Application.Threads.Commands.AddParticipant;
using ChatService.Application.Threads.Commands.AssignThread;
using ChatService.Application.Threads.Commands.EscalateThread;
using ChatService.Application.Threads.Commands.MarkRead;
using ChatService.Application.Threads.Commands.RecordTypingPing;
using ChatService.Application.Threads.Commands.RemoveParticipant;
using ChatService.Application.Threads.Commands.ReopenThread;
using ChatService.Application.Threads.Commands.ResolveThread;
using ChatService.Application.Threads.Commands.SendMessage;
using ChatService.Application.Threads.Commands.StartThread;
using ChatService.Application.Threads.Queries.GetMessages;
using ChatService.Application.Threads.Queries.GetThreadDetail;
using ChatService.Application.Threads.Queries.GetThreadInbox;
using ChatService.Application.Threads.Queries.GetUnreadCount;
using ChatService.Application.Threads.Queries.SearchHistory;
using ChatService.Domain.Enums;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace ChatService.Api.Endpoints;

/// <summary>
/// All /chat REST endpoints — thread management, messaging, search.
/// SignalR hub registered separately at /hubs/chat.
/// Rate limit: standard (100 req/min). Zero 501s, zero TODOs.
/// </summary>
public sealed class Chat : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/chat";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        // POST /chat/threads — open a new thread
        g.MapPost("/threads", StartThread)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("StartThread")
            .WithSummary("Open a new support thread with an initial message.");

        // GET /chat/threads — inbox (paginated, filterable)
        g.MapGet("/threads", GetInbox)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetThreadInbox")
            .WithSummary("List support threads (inbox view) with optional status/category filter.");

        // GET /chat/threads/{id} — thread detail
        g.MapGet("/threads/{id:guid}", GetThread)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetThreadDetail")
            .WithSummary("Get full detail of a single thread (IDOR-scoped to org).");

        // POST /chat/threads/{id}/messages — send a message
        // SEC-053: stricter rate limit — 60 msg/min per user (not default 100/min)
        g.MapPost("/threads/{id:guid}/messages", SendMessage)
            .RequireAuthorization()
            .RequireRateLimiting("chat-send-strict")
            .WithName("SendMessage")
            .WithSummary("Send a message in a thread. Idempotent via clientMessageId. Rate: 60/min (SEC-053).");

        // GET /chat/threads/{id}/messages — paginated messages (cursor-based)
        g.MapGet("/threads/{id:guid}/messages", GetMessages)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetMessages")
            .WithSummary("Get messages in a thread using cursor-based pagination.");

        // POST /chat/threads/{id}/read — mark messages as read
        g.MapPost("/threads/{id:guid}/read", MarkRead)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("MarkRead")
            .WithSummary("Mark messages in a thread as read.");

        // POST /chat/threads/{id}/assign — assign thread (permission: chat.thread.assign)
        g.MapPost("/threads/{id:guid}/assign", AssignThread)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("AssignThread")
            .WithSummary("Assign thread to an agent or CA. Requires chat.thread.assign permission.");

        // POST /chat/threads/{id}/resolve — resolve thread
        g.MapPost("/threads/{id:guid}/resolve", ResolveThread)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ResolveThread")
            .WithSummary("Mark a thread as resolved. Requires chat.thread.resolve permission.");

        // POST /chat/threads/{id}/escalate — escalate thread
        g.MapPost("/threads/{id:guid}/escalate", EscalateThread)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("EscalateThread")
            .WithSummary("Escalate a thread (e.g. to CA). Requires chat.thread.escalate permission.");

        // POST /chat/threads/{id}/reopen — re-open a resolved/escalated thread
        g.MapPost("/threads/{id:guid}/reopen", ReopenThread)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ReopenThread")
            .WithSummary("Re-open a previously resolved or escalated thread.");

        // POST /chat/threads/{id}/typing — ephemeral typing indicator
        g.MapPost("/threads/{id:guid}/typing", RecordTyping)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RecordTypingPing")
            .WithSummary("Broadcast a typing indicator to thread participants (ephemeral, no DB write).");

        // POST /chat/threads/{id}/participants — add participant
        g.MapPost("/threads/{id:guid}/participants", AddParticipant)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("AddParticipant")
            .WithSummary("Add a participant to a thread. Requires chat.thread.assign permission.");

        // DELETE /chat/threads/{id}/participants/{userId} — remove participant
        g.MapDelete("/threads/{id:guid}/participants/{userId:guid}", RemoveParticipant)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RemoveParticipant")
            .WithSummary("Remove a participant from a thread. Requires chat.thread.assign permission.");

        // GET /chat/search?q= — full-text search across message history
        g.MapGet("/search", SearchHistory)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("SearchChatHistory")
            .WithSummary("Full-text search across message history using PostgreSQL tsvector.");

        // GET /chat/unread-count — total unread count for authenticated user
        g.MapGet("/unread-count", GetUnreadCount)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetUnreadCount")
            .WithSummary("Returns total unread message and thread counts for the authenticated user.");

        // GET /chat/admin/queue-snapshot?limit=N — top-N oldest open unassigned threads
        g.MapGet("/admin/queue-snapshot", static async (int? limit, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetQueueSnapshotQuery(limit ?? 10), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetChatAdminQueueSnapshot")
            .WithSummary("Top-N open chat threads waiting for an agent — admin dashboard widget.");

        // GET /chat/admin/workload-by-user — per-assignee chat thread counts
        g.MapGet("/admin/workload-by-user", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetWorkloadByUserQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetChatAdminWorkloadByUser")
            .WithSummary("Per-assignee chat workload — admin dashboard team-workload widget.");
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    private static async Task<IResult> StartThread(
        StartThreadRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new StartThreadCommand(req.Category, req.Subject, req.InitialMessage, req.ClientMessageId), ct);
        return result.IsSuccess
            ? Results.Created($"/chat/threads/{result.Value.ThreadId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> GetInbox(
        [AsParameters] InboxParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetThreadInboxQuery(p.Status, p.Category, p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> GetThread(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetThreadDetailQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> SendMessage(
        Guid id, SendMessageRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new SendMessageCommand(id, req.Body, req.AttachmentsJson, req.ClientMessageId), ct);
        return result.IsSuccess
            ? Results.Created($"/chat/threads/{id}/messages/{result.Value.MessageId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> GetMessages(
        Guid id, [AsParameters] MessageParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetMessagesQuery(id, p.BeforeMessageId, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> MarkRead(
        Guid id, MarkReadRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new MarkReadCommand(id, req.UpToMessageId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> AssignThread(
        Guid id, AssignRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new AssignThreadCommand(id, req.AssigneeUserId, req.AssigneeRole), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> ResolveThread(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ResolveThreadCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> EscalateThread(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new EscalateThreadCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> ReopenThread(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ReopenThreadCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> RecordTyping(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RecordTypingPingCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> AddParticipant(
        Guid id, AddParticipantRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new AddParticipantCommand(id, req.UserId, req.Role), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> RemoveParticipant(
        Guid id, Guid userId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RemoveParticipantCommand(id, userId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> SearchHistory(
        [AsParameters] SearchParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SearchHistoryQuery(p.Q ?? string.Empty, p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> GetUnreadCount(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetUnreadCountQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static IResult MapError(Error error)
        => error.Type switch
        {
            ErrorType.NotFound => Results.NotFound(new { error.Code, error.Message }),
            ErrorType.Validation => Results.UnprocessableEntity(new { error.Code, error.Message }),
            ErrorType.Conflict => Results.Conflict(new { error.Code, error.Message }),
            ErrorType.Forbidden => Results.Forbid(),
            ErrorType.Unauthorized => Results.Unauthorized(),
            _ => Results.Problem(error.Message, statusCode: 500)
        };
}

// ── Request / parameter types ──────────────────────────────────────────────

/// <summary>Body for starting a new thread.</summary>
internal record StartThreadRequest(
    ThreadCategory Category,
    string InitialMessage,
    string? Subject = null,
    string? ClientMessageId = null);

/// <summary>Body for sending a message.</summary>
internal record SendMessageRequest(
    string Body,
    string? AttachmentsJson = null,
    string? ClientMessageId = null);

/// <summary>Body for marking messages as read.</summary>
internal record MarkReadRequest(Guid? UpToMessageId = null);

/// <summary>Body for assigning a thread.</summary>
internal record AssignRequest(
    Guid AssigneeUserId,
    ParticipantRole AssigneeRole = ParticipantRole.Agent);

/// <summary>Body for adding a participant.</summary>
internal record AddParticipantRequest(Guid UserId, ParticipantRole Role);

/// <summary>Query params for inbox listing.</summary>
internal record InboxParams(
    string? Status = null,
    string? Category = null,
    int Page = 1,
    int PageSize = 20);

/// <summary>Query params for message listing.</summary>
internal record MessageParams(
    Guid? BeforeMessageId = null,
    int PageSize = 50);

/// <summary>Query params for full-text search.</summary>
internal record SearchParams(
    string? Q = null,
    int Page = 1,
    int PageSize = 20);
