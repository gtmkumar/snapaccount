using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Queries.GetMessages;

/// <summary>
/// Returns messages in a thread using cursor-based pagination (before a given message ID).
/// </summary>
public record GetMessagesQuery(
    Guid ThreadId,
    Guid? BeforeMessageId = null,
    int PageSize = 50) : IQuery<MessagePageDto>;

/// <summary>Cursor-paginated message page.</summary>
public record MessagePageDto(
    IReadOnlyList<MessageDto> Items,
    bool HasMore,
    Guid? NextCursor);

/// <summary>Message DTO.</summary>
public record MessageDto(
    Guid MessageId,
    Guid ThreadId,
    Guid? SenderUserId,
    string Body,
    string? AttachmentsJson,
    string? ClientMessageId,
    DateTime CreatedAt,
    bool IsAnonymized);

/// <summary>Handler: returns messages with cursor pagination and IDOR org-scoping.</summary>
public sealed class GetMessagesQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetMessagesQuery, MessagePageDto>
{
    /// <inheritdoc />
    public async Task<Result<MessagePageDto>> Handle(
        GetMessagesQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        // IDOR: verify thread belongs to org
        var threadExists = await db.Threads
            .AnyAsync(t => t.Id == request.ThreadId && t.OrganizationId == orgId && t.DeletedAt == null,
                cancellationToken);

        if (!threadExists)
            return Error.NotFound("ChatThread", request.ThreadId);

        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var query = db.Messages
            .Where(m => m.ThreadId == request.ThreadId && m.DeletedAt == null);

        if (request.BeforeMessageId.HasValue)
        {
            var cursorCreatedAt = await db.Messages
                .Where(m => m.Id == request.BeforeMessageId)
                .Select(m => m.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            query = query.Where(m => m.CreatedAt < cursorCreatedAt);
        }

        var items = await query
            .OrderByDescending(m => m.CreatedAt)
            .Take(pageSize + 1)
            .Select(m => new MessageDto(
                m.Id,
                m.ThreadId,
                m.SenderUserId,
                m.Body,
                m.AttachmentsJson,
                m.ClientMessageId,
                m.CreatedAt,
                m.AnonymizedAt.HasValue))
            .ToListAsync(cancellationToken);

        var hasMore = items.Count > pageSize;
        if (hasMore) items.RemoveAt(items.Count - 1);

        // Return in chronological order
        items.Reverse();

        return new MessagePageDto(
            items,
            hasMore,
            hasMore ? items[0].MessageId : null);
    }
}
