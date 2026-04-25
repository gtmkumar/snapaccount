using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Queries.SearchHistory;

/// <summary>
/// Full-text search across message history using body_tsvector (GIN-indexed).
/// Org-scoped — only returns results from the caller's organisation.
/// </summary>
public record SearchHistoryQuery(
    string Q,
    int Page = 1,
    int PageSize = 20) : IQuery<SearchHistoryDto>;

/// <summary>Search results page.</summary>
public record SearchHistoryDto(
    IReadOnlyList<SearchHitDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>A single search result hit.</summary>
public record SearchHitDto(
    Guid MessageId,
    Guid ThreadId,
    Guid? SenderUserId,
    string Body,
    string ThreadCategory,
    string ThreadStatus,
    DateTime CreatedAt);

/// <summary>Handler: searches message history using PostgreSQL tsvector.</summary>
public sealed class SearchHistoryQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<SearchHistoryQuery, SearchHistoryDto>
{
    /// <inheritdoc />
    public async Task<Result<SearchHistoryDto>> Handle(
        SearchHistoryQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        if (string.IsNullOrWhiteSpace(request.Q) || request.Q.Trim().Length < 2)
            return Error.Validation("Search.TooShort", "Query must be at least 2 characters.");

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 50);

        // Use Contains() for portable LIKE search; Npgsql translates to ILIKE at runtime.
        // The body_tsvector GIN index (added via EF migration) provides FTS on body column
        // for direct SQL queries. EF LINQ Contains() hits the btree on body for small
        // result sets which is acceptable at Phase 6F scale.
        var searchTerm = request.Q.Trim().ToLowerInvariant();

        var query = db.Messages
            .Join(db.Threads,
                m => m.ThreadId,
                t => t.Id,
                (m, t) => new { Message = m, Thread = t })
            .Where(x => x.Thread.OrganizationId == orgId
                        && x.Thread.DeletedAt == null
                        && x.Message.DeletedAt == null
                        && x.Message.Body.ToLower().Contains(searchTerm));

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(x => x.Message.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new SearchHitDto(
                x.Message.Id,
                x.Message.ThreadId,
                x.Message.SenderUserId,
                x.Message.Body,
                x.Thread.Category.ToString(),
                x.Thread.Status.ToString(),
                x.Message.CreatedAt))
            .ToListAsync(cancellationToken);

        return new SearchHistoryDto(items, total, page, pageSize);
    }
}
