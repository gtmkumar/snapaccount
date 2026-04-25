using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Queries.GetUnreadCount;

/// <summary>Returns total unread message count across all threads for the authenticated user.</summary>
public record GetUnreadCountQuery : IQuery<UnreadCountDto>;

/// <summary>Unread count DTO.</summary>
public record UnreadCountDto(int UnreadCount, int UnreadThreads);

/// <summary>Handler: counts unread messages org-scoped to the caller.</summary>
public sealed class GetUnreadCountQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetUnreadCountQuery, UnreadCountDto>
{
    /// <inheritdoc />
    public async Task<Result<UnreadCountDto>> Handle(
        GetUnreadCountQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var userId = currentUser.UserId;

        // Count messages not sent by user and not yet read by user in their accessible threads
        var accessibleThreadIds = await db.ThreadParticipants
            .Where(p => p.UserId == userId && p.DeletedAt == null)
            .Select(p => p.ThreadId)
            .ToListAsync(cancellationToken);

        var unreadMessages = await db.Messages
            .Where(m => accessibleThreadIds.Contains(m.ThreadId)
                        && m.SenderUserId != userId
                        && m.DeletedAt == null
                        && !db.ReadReceipts
                            .Any(r => r.MessageId == m.Id && r.UserId == userId))
            .GroupBy(m => m.ThreadId)
            .Select(g => new { ThreadId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        return new UnreadCountDto(
            unreadMessages.Sum(g => g.Count),
            unreadMessages.Count);
    }
}
