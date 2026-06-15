using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Dashboard.Queries.GetWorkloadByUser;

/// <summary>
/// Per-assignee callback workload counts for the admin dashboard team-workload widget.
/// SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetWorkloadByUserQuery : IQuery<IReadOnlyList<UserWorkloadDto>>;

public record UserWorkloadDto(Guid UserId, int Assigned, int Completed);

public sealed class GetWorkloadByUserQueryHandler(ICallbackDbContext db)
    : IQueryHandler<GetWorkloadByUserQuery, IReadOnlyList<UserWorkloadDto>>
{
    public async Task<Result<IReadOnlyList<UserWorkloadDto>>> Handle(GetWorkloadByUserQuery request, CancellationToken ct)
    {
        var rows = await db.Callbacks
            .Where(c => c.DeletedAt == null && c.AssignedAgentId != null)
            .GroupBy(c => c.AssignedAgentId!.Value)
            .Select(g => new UserWorkloadDto(
                g.Key,
                g.Count(c => c.Status != CallbackStatus.Completed && c.Status != CallbackStatus.Cancelled),
                g.Count(c => c.Status == CallbackStatus.Completed)))
            .ToListAsync(ct);

        return Result<IReadOnlyList<UserWorkloadDto>>.Success(rows);
    }
}
