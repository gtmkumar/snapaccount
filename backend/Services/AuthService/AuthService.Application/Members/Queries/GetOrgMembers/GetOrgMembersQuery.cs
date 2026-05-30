using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Members.Queries.GetOrgMembers;

/// <summary>Returns paginated org members with their roles and status.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersRead)]
public record GetOrgMembersQuery(
    string? Role = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<OrgMembersListDto>;

/// <summary>Paginated list of org members.</summary>
public record OrgMembersListDto(
    IReadOnlyList<OrgMemberDto> Items,
    int TotalCount);

/// <summary>Single member entry matching the teamApi.ts TeamMember schema.</summary>
public record OrgMemberDto(
    string UserId,
    string Email,
    string? DisplayName,
    string Role,
    string Status,
    IReadOnlyList<string> Modules,
    string? JoinedAt,
    string? LastActiveAt,
    string? PhotoUrl);

/// <summary>
/// M1-R-INFO-002: Validates the role-name and status filter inputs so they cannot be
/// used as a role-existence oracle or to inject arbitrary filter values.
/// - Role: if provided, must be 1–100 alphanumeric/underscore/hyphen characters (no SQL wildcards).
/// - Status: if provided, must be one of the two known values.
/// - Page/PageSize: bounded to prevent expensive queries.
/// </summary>
public sealed class GetOrgMembersQueryValidator : AbstractValidator<GetOrgMembersQuery>
{
    public GetOrgMembersQueryValidator()
    {
        When(q => q.Role is not null, () =>
        {
            RuleFor(q => q.Role!)
                .NotEmpty()
                .MaximumLength(100)
                .Matches(@"^[A-Za-z0-9_\-]+$")
                .WithMessage("Role filter must contain only letters, digits, underscores, or hyphens.");
        });

        When(q => q.Status is not null, () =>
        {
            RuleFor(q => q.Status!)
                .Must(s => s.Equals("active", StringComparison.OrdinalIgnoreCase) ||
                           s.Equals("suspended", StringComparison.OrdinalIgnoreCase))
                .WithMessage("Status filter must be 'active' or 'suspended'.");
        });

        RuleFor(q => q.Page).GreaterThan(0).WithMessage("Page must be 1 or greater.");
        RuleFor(q => q.PageSize)
            .GreaterThan(0)
            .LessThanOrEqualTo(100)
            .WithMessage("PageSize must be between 1 and 100.");
    }
}

public sealed class GetOrgMembersQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetOrgMembersQuery, OrgMembersListDto>
{
    public async Task<Result<OrgMembersListDto>> Handle(
        GetOrgMembersQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Error.Forbidden("Member.NoOrg", "You must be a member of an organization.");

        var orgId = currentUser.OrganizationId.Value;

        var baseQuery = db.OrganizationMembers
            .Where(m => m.OrganizationId == orgId && m.DeletedAt == null)
            .Join(db.Users.Where(u => u.DeletedAt == null),
                m => m.UserId, u => u.Id, (m, u) => new { Member = m, User = u })
            .Join(db.Roles.Where(r => r.DeletedAt == null),
                x => x.Member.RoleId, r => r.Id, (x, r) => new { x.Member, x.User, Role = r });

        // Filter by role name (M1-R-INFO-002: input sanitised by validator above)
        var query = string.IsNullOrWhiteSpace(request.Role)
            ? baseQuery
            : baseQuery.Where(x => x.Role.Name == request.Role);

        // Filter by status (M1-R-INFO-002: only "active"/"suspended" pass validator)
        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var isActive = request.Status.Equals("active", StringComparison.OrdinalIgnoreCase);
            query = query.Where(x => x.Member.IsActive == isActive);
        }

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(x => x.Member.JoinedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(x => new OrgMemberDto(
                x.User.Id.ToString(),
                x.User.Email ?? string.Empty,
                x.User.FullName,
                x.Role.Name,
                x.Member.IsActive ? "active" : "suspended",
                new List<string>(), // modules — phase 2 extension
                x.Member.JoinedAt.ToString("O"),
                x.User.LastLoginAt.HasValue ? x.User.LastLoginAt.Value.ToString("O") : null,
                null  // photoUrl — from Firebase, not stored locally
            ))
            .ToListAsync(cancellationToken);

        return new OrgMembersListDto(items, total);
    }
}
