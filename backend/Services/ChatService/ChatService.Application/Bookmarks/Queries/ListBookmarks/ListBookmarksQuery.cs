using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Bookmarks.Queries.ListBookmarks;

/// <summary>
/// Lists all bookmarked messages for the current user (paginated).
/// Includes message body, thread context, and enrichment fields added for mobile Wave 7 reconciliation:
/// SenderUserId, SenderRole, ThreadSubject, MessageCreatedAt.
///
/// Note on SenderDisplayName: resolving display names requires a cross-schema join to auth.*
/// which violates schema-per-service isolation. Instead, SenderUserId + SenderRole are returned
/// so the mobile client can resolve names from its cached user/profile store (USER role →
/// auth user name from cache; CA role → displayName from the booking context).
/// </summary>
[RequiresPermission("chat.read")]
public record ListBookmarksQuery(
    int Page = 1,
    int PageSize = 20) : IQuery<ListBookmarksResponse>;

/// <summary>
/// A single bookmark DTO with enriched message and thread context.
/// Wave 7 mobile reconciliation: added SenderUserId, SenderRole, ThreadSubject, MessageCreatedAt.
/// </summary>
public record BookmarkDto(
    Guid BookmarkId,
    Guid MessageId,
    Guid ThreadId,
    string MessageBody,
    string? Note,
    DateTime BookmarkedAt,
    /// <summary>UTC timestamp when the original message was created.</summary>
    DateTime MessageCreatedAt,
    /// <summary>
    /// User ID of the message sender (null post-DPDP erasure).
    /// Mobile resolves display name from its user cache using this ID.
    /// </summary>
    Guid? SenderUserId,
    /// <summary>
    /// Persisted sender role: USER, CA, ADMIN, SYSTEM, AI.
    /// Lets mobile branch display-name resolution (CA → booking CA name; USER → own auth cache).
    /// </summary>
    string SenderRole,
    /// <summary>
    /// Thread subject / title set by the user at creation.
    /// Null when the thread has no subject (subject is optional on ChatThread).
    /// </summary>
    string? ThreadSubject);

/// <summary>Paginated bookmarks response.</summary>
public record ListBookmarksResponse(
    IReadOnlyList<BookmarkDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Validates ListBookmarksQuery.</summary>
public sealed class ListBookmarksQueryValidator : AbstractValidator<ListBookmarksQuery>
{
    public ListBookmarksQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

/// <summary>Handles ListBookmarksQuery — user-scoped, paginated, with thread+message enrichment.</summary>
public sealed class ListBookmarksQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListBookmarksQuery, ListBookmarksResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListBookmarksResponse>> Handle(
        ListBookmarksQuery request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<ListBookmarksResponse>.Failure(Error.Unauthorized("Bookmark.Unauthenticated", "User is not authenticated."));

        var query = db.MessageBookmarks
            .Where(b => b.UserId == currentUser.UserId);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(b => b.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Join(db.Messages,
                b => b.MessageId,
                m => m.Id,
                (b, m) => new { b, m })
            .Join(db.Threads,
                x => x.m.ThreadId,
                t => t.Id,
                (x, t) => new BookmarkDto(
                    x.b.Id,
                    x.m.Id,
                    x.m.ThreadId,
                    x.m.Body,
                    x.b.Note,
                    x.b.CreatedAt,
                    x.m.CreatedAt,
                    x.m.SenderUserId,
                    x.m.SenderRole.ToString(),
                    t.Subject))
            .ToListAsync(cancellationToken);

        return Result<ListBookmarksResponse>.Success(
            new ListBookmarksResponse(items, total, request.Page, request.PageSize));
    }
}
