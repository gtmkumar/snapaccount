using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Dashboard.Queries.GetWorkloadByUser;

/// <summary>
/// Per-assignee GST notice workload counts for the admin team-workload grid
/// (design Screen 89). Groups notices by the CA they are assigned to.
/// "Assigned" = notice has an AssignedCaId AND status is not CLOSED.
/// "Completed" = status == CLOSED.
/// SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetWorkloadByUserQuery : IQuery<IReadOnlyList<UserWorkloadDto>>;

public record UserWorkloadDto(Guid UserId, int Assigned, int Completed);

public sealed class GetWorkloadByUserQueryHandler(IGstDbContext db)
    : IQueryHandler<GetWorkloadByUserQuery, IReadOnlyList<UserWorkloadDto>>
{
    public async Task<Result<IReadOnlyList<UserWorkloadDto>>> Handle(GetWorkloadByUserQuery request, CancellationToken ct)
    {
        var rows = await db.GstNotices
            .Where(n => n.DeletedAt == null && n.AssignedCaId != null)
            .GroupBy(n => n.AssignedCaId!.Value)
            .Select(g => new UserWorkloadDto(
                g.Key,
                g.Count(n => n.Status != "CLOSED"),
                g.Count(n => n.Status == "CLOSED")))
            .ToListAsync(ct);

        return Result<IReadOnlyList<UserWorkloadDto>>.Success(rows);
    }
}
