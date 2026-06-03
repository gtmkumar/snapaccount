using AuthService.Application.Common.Interfaces;
using AuthService.Application.Invitations.Queries.GetOrgInvites;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PlatformAdmin.Queries.ListOrgInvitesForAdmin;

/// <summary>
/// Returns all invitations for an arbitrary organization.
/// Admin-only variant of <see cref="AuthService.Application.Invitations.Queries.GetOrgInvites.GetOrgInvitesQuery"/>
/// — scoped by the supplied <paramref name="OrganizationId"/> rather than the caller's own org.
/// </summary>
/// <param name="OrganizationId">The organization whose invites to retrieve.</param>
[RequiresPermission(AuthService.Domain.Permissions.PlatformOrgsRead)]
public record ListOrgInvitesForAdminQuery(Guid OrganizationId)
    : IQuery<IReadOnlyList<OrgInviteDto>>;

/// <summary>
/// Handles <see cref="ListOrgInvitesForAdminQuery"/>. Mirrors the projection used by
/// <see cref="AuthService.Application.Invitations.Queries.GetOrgInvites.GetOrgInvitesQueryHandler"/>
/// but filters by the supplied <c>OrganizationId</c> instead of the current user's org.
/// </summary>
public sealed class ListOrgInvitesForAdminQueryHandler(IAuthDbContext db)
    : IQueryHandler<ListOrgInvitesForAdminQuery, IReadOnlyList<OrgInviteDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<OrgInviteDto>>> Handle(
        ListOrgInvitesForAdminQuery request,
        CancellationToken cancellationToken)
    {
        var invites = await db.Invitations
            .Where(i => i.OrganizationId == request.OrganizationId && i.DeletedAt == null)
            .Join(db.Roles.Where(r => r.DeletedAt == null),
                i => i.RoleId, r => r.Id, (i, r) => new { Invite = i, Role = r })
            .OrderByDescending(x => x.Invite.CreatedAt)
            .Take(100) // Reasonable cap — pagination can be added later
            .Select(x => new OrgInviteDto(
                x.Invite.Id.ToString(),
                x.Invite.Email,
                x.Role.Name,
                x.Invite.InvitedByUserId.ToString(),
                x.Invite.CreatedAt.ToString("O"),
                x.Invite.ExpiresAt.ToString("O"),
                x.Invite.Status.ToString().ToLowerInvariant()))
            .ToListAsync(cancellationToken);

        // Mark expired pending invitations in-memory (mirrors GetOrgInvitesQueryHandler behaviour)
        var now = DateTime.UtcNow;
        invites = invites
            .Select(i => i.Status == "pending" && DateTime.Parse(i.ExpiresAt) < now
                ? i with { Status = "expired" }
                : i)
            .ToList();

        return Result<IReadOnlyList<OrgInviteDto>>.Success(invites);
    }
}
