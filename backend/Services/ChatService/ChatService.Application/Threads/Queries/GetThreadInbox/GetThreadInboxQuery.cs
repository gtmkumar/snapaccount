using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Queries.GetThreadInbox;

/// <summary>Returns a paginated list of threads for the caller's org (inbox view).</summary>
public record GetThreadInboxQuery(
    string? Status = null,
    string? Category = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ThreadInboxDto>;

/// <summary>Paginated inbox result.</summary>
public record ThreadInboxDto(
    IReadOnlyList<ThreadSummaryDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Summary row for inbox list.</summary>
public record ThreadSummaryDto(
    Guid ThreadId,
    string Status,
    string Category,
    string? Subject,
    Guid InitiatedByUserId,
    Guid? AssignedToUserId,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int UnreadCount,
    string? LastMessageBody,
    DateTime? LastMessageAt);

/// <summary>Handler: inbox query with org-scoping and optional status/category filter.</summary>
public sealed class GetThreadInboxQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetThreadInboxQuery, ThreadInboxDto>
{
    /// <inheritdoc />
    public async Task<Result<ThreadInboxDto>> Handle(
        GetThreadInboxQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var query = db.Threads
            .Where(t => t.OrganizationId == orgId && t.DeletedAt == null);

        // Admins/agents see all threads; regular users see only their own.
        // Canonical staff roles (Phase-6F ADMIN/OPS/LOAN_OFFICER aliases retired).
        var isAdmin = currentUser.IsInRole("SUPER_ADMIN") || currentUser.IsInRole("OPERATIONS_MANAGER")
            || currentUser.IsInRole("CA") || currentUser.IsInRole("SUPPORT_EXECUTIVE");

        if (!isAdmin)
            query = query.Where(t => t.InitiatedByUserId == currentUser.UserId);

        if (!string.IsNullOrEmpty(request.Status) &&
            Enum.TryParse<ThreadStatus>(request.Status, ignoreCase: true, out var statusEnum))
            query = query.Where(t => t.Status == statusEnum);

        if (!string.IsNullOrEmpty(request.Category) &&
            Enum.TryParse<ThreadCategory>(request.Category, ignoreCase: true, out var categoryEnum))
            query = query.Where(t => t.Category == categoryEnum);

        var total = await query.CountAsync(cancellationToken);

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var threads = await query
            .OrderByDescending(t => t.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new
            {
                t.Id,
                t.Status,
                t.Category,
                t.Subject,
                t.InitiatedByUserId,
                t.AssignedToUserId,
                t.CreatedAt,
                t.UpdatedAt,
                UnreadCount = t.Messages
                    .Where(m => m.DeletedAt == null && m.SenderUserId != currentUser.UserId)
                    .Count(m => !db.ReadReceipts
                        .Any(r => r.ThreadId == t.Id
                                  && r.UserId == currentUser.UserId
                                  && r.ReadAt >= m.CreatedAt)),
                LastMessageBody = t.Messages
                    .Where(m => m.DeletedAt == null)
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => m.Body)
                    .FirstOrDefault(),
                LastMessageAt = t.Messages
                    .Where(m => m.DeletedAt == null)
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => (DateTime?)m.CreatedAt)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var items = threads.Select(t => new ThreadSummaryDto(
            t.Id,
            t.Status.ToString(),
            t.Category.ToString(),
            t.Subject,
            t.InitiatedByUserId,
            t.AssignedToUserId,
            t.CreatedAt,
            t.UpdatedAt,
            t.UnreadCount,
            t.LastMessageBody,
            t.LastMessageAt)).ToList();

        return new ThreadInboxDto(items, total, page, pageSize);
    }
}
