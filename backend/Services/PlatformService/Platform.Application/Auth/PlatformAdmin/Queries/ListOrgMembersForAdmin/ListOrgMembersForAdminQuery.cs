using AuthService.Application.Common.Interfaces;
using AuthService.Application.Members.Queries.GetOrgMembers;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PlatformAdmin.Queries.ListOrgMembersForAdmin;

/// <summary>
/// Returns a paginated list of members for an arbitrary organization.
/// Admin-only variant of <see cref="AuthService.Application.Members.Queries.GetOrgMembers.GetOrgMembersQuery"/>
/// — scoped by the supplied <paramref name="OrganizationId"/> rather than the caller's own org.
/// </summary>
/// <param name="OrganizationId">The organization whose members to retrieve.</param>
/// <param name="Page">1-based page number.</param>
/// <param name="PageSize">Items per page (max 100).</param>
[RequiresPermission(AuthService.Domain.Permissions.PlatformOrgsRead)]
public record ListOrgMembersForAdminQuery(
    Guid OrganizationId,
    int Page = 1,
    int PageSize = 20) : IQuery<OrgMembersListDto>;

/// <summary>FluentValidation validator for <see cref="ListOrgMembersForAdminQuery"/>.</summary>
public sealed class ListOrgMembersForAdminQueryValidator : AbstractValidator<ListOrgMembersForAdminQuery>
{
    public ListOrgMembersForAdminQueryValidator()
    {
        RuleFor(q => q.OrganizationId).NotEmpty().WithMessage("OrganizationId is required.");
        RuleFor(q => q.Page).GreaterThan(0).WithMessage("Page must be 1 or greater.");
        RuleFor(q => q.PageSize)
            .GreaterThan(0)
            .LessThanOrEqualTo(100)
            .WithMessage("PageSize must be between 1 and 100.");
    }
}

/// <summary>
/// Handles <see cref="ListOrgMembersForAdminQuery"/>. Mirrors the projection used by
/// <see cref="AuthService.Application.Members.Queries.GetOrgMembers.GetOrgMembersQueryHandler"/>
/// but filters by the supplied <c>OrganizationId</c> instead of the current user's org.
/// </summary>
public sealed class ListOrgMembersForAdminQueryHandler(IAuthDbContext db)
    : IQueryHandler<ListOrgMembersForAdminQuery, OrgMembersListDto>
{
    /// <inheritdoc />
    public async Task<Result<OrgMembersListDto>> Handle(
        ListOrgMembersForAdminQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.OrganizationMembers
            .Where(m => m.OrganizationId == request.OrganizationId && m.DeletedAt == null)
            .Join(db.Users.Where(u => u.DeletedAt == null),
                m => m.UserId, u => u.Id, (m, u) => new { Member = m, User = u })
            .Join(db.Roles.Where(r => r.DeletedAt == null),
                x => x.Member.RoleId, r => r.Id, (x, r) => new { x.Member, x.User, Role = r });

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
