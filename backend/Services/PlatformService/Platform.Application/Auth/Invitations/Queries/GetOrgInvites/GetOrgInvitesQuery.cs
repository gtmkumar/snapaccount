using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Invitations.Queries.GetOrgInvites;

/// <summary>Returns all pending (and recent) invitations for the caller's organization.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersInvite)]
public record GetOrgInvitesQuery : IQuery<IReadOnlyList<OrgInviteDto>>;

/// <summary>Matches the teamApi.ts PendingInviteSchema.</summary>
public record OrgInviteDto(
    string InviteId,
    string Email,
    string Role,
    string? InvitedByUserId,
    string InvitedAt,
    string ExpiresAt,
    string Status);

public sealed class GetOrgInvitesQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetOrgInvitesQuery, IReadOnlyList<OrgInviteDto>>
{
    public async Task<Result<IReadOnlyList<OrgInviteDto>>> Handle(
        GetOrgInvitesQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Error.Forbidden("Invitation.NoOrg", "You must be a member of an organization.");

        var orgId = currentUser.OrganizationId.Value;

        var invites = await db.Invitations
            .Where(i => i.OrganizationId == orgId && i.DeletedAt == null)
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

        // Mark expired pending invitations in-memory (don't bother updating DB here)
        var now = DateTime.UtcNow;
        invites = invites
            .Select(i => i.Status == "pending" && DateTime.Parse(i.ExpiresAt) < now
                ? i with { Status = "expired" }
                : i)
            .ToList();

        return Result<IReadOnlyList<OrgInviteDto>>.Success(invites);
    }
}
