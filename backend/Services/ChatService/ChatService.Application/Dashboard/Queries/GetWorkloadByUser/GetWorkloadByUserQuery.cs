using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Dashboard.Queries.GetWorkloadByUser;

/// <summary>
/// Per-assignee chat workload counts for the admin dashboard team-workload widget.
/// "Assigned" = thread has assignedToUserId set AND status != Resolved.
/// "Completed" = status == Resolved.
/// SYSTEM_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetWorkloadByUserQuery : IQuery<IReadOnlyList<UserWorkloadDto>>;

public record UserWorkloadDto(Guid UserId, int Assigned, int Completed);

public sealed class GetWorkloadByUserQueryHandler(IChatServiceDbContext db)
    : IQueryHandler<GetWorkloadByUserQuery, IReadOnlyList<UserWorkloadDto>>
{
    public async Task<Result<IReadOnlyList<UserWorkloadDto>>> Handle(GetWorkloadByUserQuery request, CancellationToken ct)
    {
        var rows = await db.Threads
            .Where(t => t.DeletedAt == null && t.AssignedToUserId != null)
            .GroupBy(t => t.AssignedToUserId!.Value)
            .Select(g => new UserWorkloadDto(
                g.Key,
                g.Count(t => t.Status != ThreadStatus.Resolved),
                g.Count(t => t.Status == ThreadStatus.Resolved)))
            .ToListAsync(ct);

        return Result<IReadOnlyList<UserWorkloadDto>>.Success(rows);
    }
}
