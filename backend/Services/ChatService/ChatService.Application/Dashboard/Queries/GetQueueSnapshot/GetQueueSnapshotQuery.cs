using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Dashboard.Queries.GetQueueSnapshot;

/// <summary>
/// Top-N oldest open chat threads waiting for an agent.
/// "Open" = ThreadStatus.Open AND assigned_to_user_id IS NULL.
/// SYSTEM_ADMIN only — cross-org snapshot for the admin dashboard widget.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetQueueSnapshotQuery(int Limit = 10) : IQuery<IReadOnlyList<QueueItem>>;

public record QueueItem(
    Guid ThreadId,
    string Category,
    string? Subject,
    Guid InitiatedByUserId,
    DateTime CreatedAt,
    int WaitMins);

public sealed class GetQueueSnapshotQueryValidator : AbstractValidator<GetQueueSnapshotQuery>
{
    public GetQueueSnapshotQueryValidator() => RuleFor(x => x.Limit).InclusiveBetween(1, 100);
}

public sealed class GetQueueSnapshotQueryHandler(IChatServiceDbContext db)
    : IQueryHandler<GetQueueSnapshotQuery, IReadOnlyList<QueueItem>>
{
    public async Task<Result<IReadOnlyList<QueueItem>>> Handle(GetQueueSnapshotQuery request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        var rows = await db.Threads
            .Where(t => t.DeletedAt == null
                     && t.Status == ThreadStatus.Open
                     && t.AssignedToUserId == null)
            .OrderBy(t => t.CreatedAt)
            .Take(request.Limit)
            .Select(t => new QueueItem(
                t.Id,
                t.Category.ToString(),
                t.Subject,
                t.InitiatedByUserId,
                t.CreatedAt,
                (int)(now - t.CreatedAt).TotalMinutes))
            .ToListAsync(ct);

        return Result<IReadOnlyList<QueueItem>>.Success(rows);
    }
}
