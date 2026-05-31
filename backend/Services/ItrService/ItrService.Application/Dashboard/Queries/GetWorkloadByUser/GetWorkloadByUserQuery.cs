using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Dashboard.Queries.GetWorkloadByUser;

/// <summary>
/// Per-assignee ITR grievance workload counts for the admin team-workload grid
/// (design Screen 89). Groups grievances by the staff member they are assigned to.
/// "Assigned" = grievance has an AssignedTo AND status is OPEN/IN_PROGRESS.
/// "Completed" = status == RESOLVED or CLOSED.
/// SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetWorkloadByUserQuery : IQuery<IReadOnlyList<UserWorkloadDto>>;

public record UserWorkloadDto(Guid UserId, int Assigned, int Completed);

public sealed class GetWorkloadByUserQueryHandler(IItrDbContext db)
    : IQueryHandler<GetWorkloadByUserQuery, IReadOnlyList<UserWorkloadDto>>
{
    public async Task<Result<IReadOnlyList<UserWorkloadDto>>> Handle(GetWorkloadByUserQuery request, CancellationToken ct)
    {
        var rows = await db.Grievances
            .Where(g => g.DeletedAt == null && g.AssignedTo != null)
            .GroupBy(g => g.AssignedTo!.Value)
            .Select(grp => new UserWorkloadDto(
                grp.Key,
                grp.Count(g => g.Status != "RESOLVED" && g.Status != "CLOSED"),
                grp.Count(g => g.Status == "RESOLVED" || g.Status == "CLOSED")))
            .ToListAsync(ct);

        return Result<IReadOnlyList<UserWorkloadDto>>.Success(rows);
    }
}
