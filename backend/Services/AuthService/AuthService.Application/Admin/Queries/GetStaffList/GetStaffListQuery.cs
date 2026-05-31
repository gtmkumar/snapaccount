using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetStaffList;

/// <summary>
/// Lists SnapAccount internal staff (operational roles) with profile + status
/// detail for the Team › Staff screen (design Screen 87). This is the richer
/// counterpart to <c>GetTeamMembersQuery</c> (which returns only id/name/role
/// for picker widgets): it adds email, active/suspended status, joined date and
/// last-active timestamp so the staff table can render fully.
///
/// Optional role filter is whitelisted against the operational-role set so it
/// cannot be used to enumerate customers (BUSINESS_OWNER / EMPLOYEE).
/// SUPER_ADMIN only (admin.dashboard.read), matching the team-workload widgets.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetStaffListQuery(string? Role = null) : IQuery<IReadOnlyList<StaffMemberDto>>;

public record StaffMemberDto(
    string UserId,
    string Name,
    string Email,
    string Role,
    string RoleDisplayName,
    string Status,
    string? JoinedAt,
    string? LastActiveAt);

public sealed class GetStaffListQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetStaffListQuery, IReadOnlyList<StaffMemberDto>>
{
    // SnapAccount internal-staff roles (the "Team" population — design Screen 87):
    // the operational roles + the platform super-admin (SUPER_ADMIN, canonical per
    // migration 036). ORG_ADMIN/MANAGER/HR/REVIEWER are customer-org roles and NOT here.
    private static readonly string[] OperationalRoles =
        ["DATA_ENTRY_OPERATOR", "SUPPORT_EXECUTIVE", "CA", "OPERATIONS_MANAGER", "PARTNER_BANK_REP", "SUPER_ADMIN"];

    public async Task<Result<IReadOnlyList<StaffMemberDto>>> Handle(GetStaffListQuery request, CancellationToken ct)
    {
        // Whitelist guards against role-name spoofing — an attacker can't filter by
        // BUSINESS_OWNER to enumerate customers through the staff endpoint.
        var allowed = string.IsNullOrWhiteSpace(request.Role)
            ? OperationalRoles
            : OperationalRoles.Contains(request.Role)
                ? new[] { request.Role }
                : Array.Empty<string>();

        if (allowed.Length == 0)
            return Result<IReadOnlyList<StaffMemberDto>>.Success(Array.Empty<StaffMemberDto>());

        // Project to an anonymous type first (EF cannot translate Distinct over a DTO
        // constructor projection), then shape + order in memory. A staff member with
        // multiple operational roles surfaces once per role — matching GetTeamMembers.
        var rows = await (
            from ur in db.UserRoles
            join u in db.Users on ur.UserId equals u.Id
            join r in db.Roles on ur.RoleId equals r.Id
            where ur.IsActive
               && !u.IsDeleted
               && allowed.Contains(r.Name)
            select new
            {
                u.Id,
                u.FullName,
                u.Email,
                RoleName = r.Name,
                r.DisplayName,
                u.IsActive,
                u.CreatedAt,
                u.LastLoginAt,
            })
            .Distinct()
            .ToListAsync(ct);

        var staff = rows
            .Select(x => new StaffMemberDto(
                x.Id.ToString(),
                x.FullName ?? "(no name)",
                x.Email ?? string.Empty,
                x.RoleName,
                x.DisplayName,
                x.IsActive ? "active" : "suspended",
                x.CreatedAt.ToString("O"),
                x.LastLoginAt?.ToString("O")))
            .OrderBy(m => m.Name)
            .ToList();

        return Result<IReadOnlyList<StaffMemberDto>>.Success(staff);
    }
}
