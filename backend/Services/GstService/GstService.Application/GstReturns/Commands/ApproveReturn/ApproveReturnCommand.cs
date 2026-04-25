using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.ApproveReturn;

/// <remarks>
/// Requires <c>gst.returns.approve</c> permission (CA/Admin role).
/// SEC-012: enforced by PermissionBehavior at pipeline level.
/// </remarks>
[RequiresPermission("gst.returns.approve")]
public record ApproveReturnCommand(Guid GstReturnId) : ICommand;

/// <summary>
/// Transitions a GST return from PENDING_APPROVAL to APPROVED status.
/// Enforces the domain state machine via <see cref="GstReturn.Approve"/>.
/// SEC-012: Decorated with [RequiresPermission] to enforce CA/Admin RBAC at pipeline level.
/// </summary>
public sealed class ApproveReturnCommandHandler(
    IGstReturnRepository repository,
    ICurrentUser currentUser)
    : ICommandHandler<ApproveReturnCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(ApproveReturnCommand request, CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        var result = gstReturn.Approve(currentUser.UserId);
        if (result.IsFailure)
            return result;

        await repository.UpdateAsync(gstReturn, cancellationToken);
        return Result.Success();
    }
}
