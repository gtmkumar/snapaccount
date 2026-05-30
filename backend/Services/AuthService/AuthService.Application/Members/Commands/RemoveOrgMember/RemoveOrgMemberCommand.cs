using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Members.Commands.RemoveOrgMember;

/// <summary>Permanently removes (soft-deletes) a member from the org.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersRemove)]
public record RemoveOrgMemberCommand(Guid MemberId) : ICommand;

public sealed class RemoveOrgMemberCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<RemoveOrgMemberCommand>
{
    public async Task<Result> Handle(RemoveOrgMemberCommand request, CancellationToken cancellationToken)
    {
        // TASK A: validate org context before any FK-touching write
        var (orgId, orgFailure) = await OrgContextGuard.ValidateAsync(
            db, currentUser, requireMembership: true, cancellationToken);
        if (orgFailure is not null)
            return Result.Failure(orgFailure);

        var member = await db.OrganizationMembers
            .FirstOrDefaultAsync(m =>
                m.Id == request.MemberId &&
                m.OrganizationId == orgId &&
                m.DeletedAt == null,
                cancellationToken);

        if (member is null)
            return Result.Failure(Error.NotFound("Member", request.MemberId));

        if (member.UserId == currentUser.UserId)
            return Result.Failure(Error.Validation("Member.SelfRemove", "You cannot remove yourself from the organization."));

        member.Deactivate();
        member.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
