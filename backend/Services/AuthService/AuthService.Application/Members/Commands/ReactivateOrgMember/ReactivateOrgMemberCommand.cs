using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Members.Commands.ReactivateOrgMember;

/// <summary>Reactivates a previously suspended org member.</summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgMembersSuspend)]
public record ReactivateOrgMemberCommand(Guid MemberId) : ICommand;

public sealed class ReactivateOrgMemberCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<ReactivateOrgMemberCommand>
{
    public async Task<Result> Handle(ReactivateOrgMemberCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result.Failure(Error.Forbidden("Member.NoOrg", "You must be a member of an organization."));

        var orgId = currentUser.OrganizationId.Value;

        var member = await db.OrganizationMembers
            .FirstOrDefaultAsync(m =>
                m.Id == request.MemberId &&
                m.OrganizationId == orgId &&
                !m.IsActive &&
                m.DeletedAt == null,
                cancellationToken);

        if (member is null)
            return Result.Failure(Error.NotFound("Member", request.MemberId));

        member.Reactivate();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
