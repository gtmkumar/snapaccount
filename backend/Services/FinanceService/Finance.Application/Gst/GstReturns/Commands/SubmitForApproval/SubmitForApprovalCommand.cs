using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.SubmitForApproval;

public record SubmitForApprovalCommand(Guid GstReturnId) : ICommand;

/// <summary>
/// Transitions a GST return from DRAFT to PENDING_APPROVAL status.
/// Enforces the domain state machine via <see cref="GstReturn.SubmitForApproval"/>.
/// </summary>
public sealed class SubmitForApprovalCommandHandler(
    IGstReturnRepository repository,
    ICurrentUser currentUser)
    : ICommandHandler<SubmitForApprovalCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(SubmitForApprovalCommand request, CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        var result = gstReturn.SubmitForApproval(currentUser.UserId);
        if (result.IsFailure)
            return result;

        await repository.UpdateAsync(gstReturn, cancellationToken);
        return Result.Success();
    }
}
