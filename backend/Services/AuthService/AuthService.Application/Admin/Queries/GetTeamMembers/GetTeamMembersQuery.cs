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
/// SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetTeamMembersQuery(string? Role = null) : IQuery<IReadOnlyList<TeamMemberDto>>;

public record TeamMemberDto(Guid UserId, string Name, string Role);

public sealed class GetTeamMembersQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetTeamMembersQuery, IReadOnlyList<TeamMemberDto>>
{
    // SnapAccount internal-staff roles (the "Team" population — design Screen 87):
    // the operational roles + the platform super-admin (SUPER_ADMIN, canonical per
    // migration 036). ORG_ADMIN/MANAGER/HR/REVIEWER are customer-org roles and NOT here.
    private static readonly string[] OperationalRoles =
        ["DATA_ENTRY_OPERATOR", "SUPPORT_EXECUTIVE", "CA", "OPERATIONS_MANAGER", "SUPER_ADMIN"];

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

        // Project to an anonymous type for the DISTINCT (EF cannot translate Distinct over
        // a DTO constructor projection, nor OrderBy on a constructor-arg afterwards), then
        // shape the DTO + null-coalesce + order in memory.
        var rows = await (
            from ur in db.UserRoles
            join u in db.Users on ur.UserId equals u.Id
            join r in db.Roles on ur.RoleId equals r.Id
            where ur.IsActive
               && u.IsActive
               && !u.IsDeleted
               && allowed.Contains(r.Name)
            select new { u.Id, u.FullName, r.DisplayName })
            .Distinct()
            .ToListAsync(ct);

        var members = rows
            .Select(x => new TeamMemberDto(x.Id, x.FullName ?? "(no name)", x.DisplayName))
            .OrderBy(m => m.Name)
            .ToList();

        return Result<IReadOnlyList<TeamMemberDto>>.Success(members);
    }
}
