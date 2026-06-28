using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
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
/// DG-GST-02: appends a GstReturnAudit row on every successful state transition.
/// </summary>
public sealed class ApproveReturnCommandHandler(
    IGstReturnRepository repository,
    IGstDbContext dbContext,
    ICurrentUser currentUser)
    : ICommandHandler<ApproveReturnCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(ApproveReturnCommand request, CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        var previousStatus = gstReturn.Status;

        var result = gstReturn.Approve(currentUser.UserId);
        if (result.IsFailure)
            return result;

        await repository.UpdateAsync(gstReturn, cancellationToken);

        // DG-GST-02: append audit row
        var audit = GstReturnAudit.RecordTransition(
            gstReturnId: gstReturn.Id,
            eventType: "APPROVED",
            actorUserId: currentUser.UserId,
            actorEmail: currentUser.Email ?? "unknown",
            previousStatus: previousStatus);

        dbContext.GstReturnAudits.Add(audit);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
