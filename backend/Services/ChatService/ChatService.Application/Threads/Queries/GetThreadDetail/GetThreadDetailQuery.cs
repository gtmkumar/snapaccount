using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Queries.GetThreadDetail;

/// <summary>Returns full detail for a single thread (IDOR org-scoped).</summary>
public record GetThreadDetailQuery(Guid ThreadId) : IQuery<ThreadDetailDto>;

/// <summary>Full thread detail DTO.</summary>
public record ThreadDetailDto(
    Guid ThreadId,
    string Status,
    string Category,
    string? Subject,
    Guid OrganizationId,
    Guid InitiatedByUserId,
    Guid? AssignedToUserId,
    DateTime? ResolvedAt,
    DateTime? EscalatedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<ParticipantDto> Participants);

/// <summary>Participant summary.</summary>
public record ParticipantDto(Guid UserId, string Role);

/// <summary>Handler: returns thread detail with IDOR org-scoping.</summary>
public sealed class GetThreadDetailQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetThreadDetailQuery, ThreadDetailDto>
{
    /// <inheritdoc />
    public async Task<Result<ThreadDetailDto>> Handle(
        GetThreadDetailQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var thread = await db.Threads
            .Where(t => t.Id == request.ThreadId && t.OrganizationId == orgId && t.DeletedAt == null)
            .Select(t => new
            {
                t.Id,
                t.Status,
                t.Category,
                t.Subject,
                t.OrganizationId,
                t.InitiatedByUserId,
                t.AssignedToUserId,
                t.ResolvedAt,
                t.EscalatedAt,
                t.CreatedAt,
                t.UpdatedAt,
                Participants = t.Participants
                    .Where(p => p.DeletedAt == null)
                    .Select(p => new { p.UserId, p.Role })
                    .ToList()
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (thread == null)
            return Error.NotFound("ChatThread", request.ThreadId);

        return new ThreadDetailDto(
            thread.Id,
            thread.Status.ToString(),
            thread.Category.ToString(),
            thread.Subject,
            thread.OrganizationId,
            thread.InitiatedByUserId,
            thread.AssignedToUserId,
            thread.ResolvedAt,
            thread.EscalatedAt,
            thread.CreatedAt,
            thread.UpdatedAt,
            thread.Participants.Select(p => new ParticipantDto(p.UserId, p.Role.ToString())).ToList());
    }
}
