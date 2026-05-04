using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetTeamMembers;

/// <summary>
/// Lists active operational team members (any role except BUSINESS_OWNER /
/// EMPLOYEE) for the admin dashboard team-workload widget. SYSTEM_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetTeamMembersQuery : IQuery<IReadOnlyList<TeamMemberDto>>;

public record TeamMemberDto(Guid UserId, string Name, string Role);

public sealed class GetTeamMembersQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetTeamMembersQuery, IReadOnlyList<TeamMemberDto>>
{
    private static readonly string[] OperationalRoles =
        ["DATA_ENTRY_OPERATOR", "SUPPORT_EXECUTIVE", "CA", "OPERATIONS_MANAGER", "SYSTEM_ADMIN"];

    public async Task<Result<IReadOnlyList<TeamMemberDto>>> Handle(GetTeamMembersQuery request, CancellationToken ct)
    {
        var rows = await (
            from ur in db.UserRoles
            join u in db.Users on ur.UserId equals u.Id
            join r in db.Roles on ur.RoleId equals r.Id
            where ur.IsActive
               && u.IsActive
               && !u.IsDeleted
               && OperationalRoles.Contains(r.Name)
            select new TeamMemberDto(u.Id, u.FullName ?? "(no name)", r.DisplayName))
            .Distinct()
            .OrderBy(m => m.Name)
            .ToListAsync(ct);

        return Result<IReadOnlyList<TeamMemberDto>>.Success(rows);
    }
}
