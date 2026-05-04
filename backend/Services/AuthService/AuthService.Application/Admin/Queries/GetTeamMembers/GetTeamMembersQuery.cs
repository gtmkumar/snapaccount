using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetTeamMembers;

/// <summary>
/// Lists active operational team members for admin widgets.
/// Without a role filter: every operational role except BUSINESS_OWNER /
/// EMPLOYEE (used by the dashboard team-workload widget).
/// With <paramref name="Role"/> set (e.g. "CA"): just that role — used by
/// the GST filing-queue assign-to dropdown and similar pickers.
/// SYSTEM_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetTeamMembersQuery(string? Role = null) : IQuery<IReadOnlyList<TeamMemberDto>>;

public record TeamMemberDto(Guid UserId, string Name, string Role);

public sealed class GetTeamMembersQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetTeamMembersQuery, IReadOnlyList<TeamMemberDto>>
{
    private static readonly string[] OperationalRoles =
        ["DATA_ENTRY_OPERATOR", "SUPPORT_EXECUTIVE", "CA", "OPERATIONS_MANAGER", "SYSTEM_ADMIN"];

    public async Task<Result<IReadOnlyList<TeamMemberDto>>> Handle(GetTeamMembersQuery request, CancellationToken ct)
    {
        // Restrict to a single role when supplied; otherwise return the whole
        // operational set. The whitelist guards against role-name spoofing —
        // an attacker can't filter by BUSINESS_OWNER to enumerate customers.
        var allowed = string.IsNullOrWhiteSpace(request.Role)
            ? OperationalRoles
            : OperationalRoles.Contains(request.Role)
                ? new[] { request.Role }
                : Array.Empty<string>();

        if (allowed.Length == 0)
            return Result<IReadOnlyList<TeamMemberDto>>.Success(Array.Empty<TeamMemberDto>());

        var rows = await (
            from ur in db.UserRoles
            join u in db.Users on ur.UserId equals u.Id
            join r in db.Roles on ur.RoleId equals r.Id
            where ur.IsActive
               && u.IsActive
               && !u.IsDeleted
               && allowed.Contains(r.Name)
            select new TeamMemberDto(u.Id, u.FullName ?? "(no name)", r.DisplayName))
            .Distinct()
            .OrderBy(m => m.Name)
            .ToListAsync(ct);

        return Result<IReadOnlyList<TeamMemberDto>>.Success(rows);
    }
}
