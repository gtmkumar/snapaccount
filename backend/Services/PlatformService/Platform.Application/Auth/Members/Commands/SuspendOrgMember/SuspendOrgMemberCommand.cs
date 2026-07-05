using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Members.Commands.SuspendOrgMember;

/// <summary>Suspends an active org member (sets IsActive=false). Does not delete.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersSuspend)]
public record SuspendOrgMemberCommand(Guid MemberId) : ICommand;

public sealed class SuspendOrgMemberCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<SuspendOrgMemberCommand>
{
    public async Task<Result> Handle(SuspendOrgMemberCommand request, CancellationToken cancellationToken)
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
                m.IsActive &&
                m.DeletedAt == null,
                cancellationToken);

        if (member is null)
            return Result.Failure(Error.NotFound("Member", request.MemberId));

        // Cannot suspend yourself
        if (member.UserId == currentUser.UserId)
            return Result.Failure(Error.Validation("Member.SelfSuspend", "You cannot suspend your own membership."));

        member.Deactivate();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
