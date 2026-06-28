using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.RequestRevision;

/// <summary>
/// Transitions a GST return from PENDING_APPROVAL or APPROVED back to REVISION_NEEDED.
/// Mapped to POST /gst/returns/{id}/revision.
/// Frontend caller: <c>flagGstReturnRevision(returnId, note)</c> in gstApi.ts.
/// DG-GST-02: appends a GstReturnAudit row recording the REVISION_REQUESTED event.
/// </summary>
[RequiresPermission("gst.returns.approve")]
public record RequestRevisionCommand(Guid GstReturnId, string Note) : ICommand;

/// <summary>Validates the request-revision command.</summary>
public sealed class RequestRevisionCommandValidator : AbstractValidator<RequestRevisionCommand>
{
    public RequestRevisionCommandValidator()
    {
        RuleFor(x => x.GstReturnId).NotEmpty();
        RuleFor(x => x.Note).NotEmpty().MaximumLength(2000);
    }
}

/// <summary>Handles <see cref="RequestRevisionCommand"/>.</summary>
public sealed class RequestRevisionCommandHandler(
    IGstReturnRepository repository,
    IGstDbContext dbContext,
    ICurrentUser currentUser)
    : ICommandHandler<RequestRevisionCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RequestRevisionCommand request, CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        var previousStatus = gstReturn.Status;

        var result = gstReturn.RequestRevision(request.Note);
        if (result.IsFailure)
            return result;

        await repository.UpdateAsync(gstReturn, cancellationToken);

        // DG-GST-02: append audit row
        var audit = GstReturnAudit.RecordTransition(
            gstReturnId: gstReturn.Id,
            eventType: "REVISION_REQUESTED",
            actorUserId: currentUser.UserId,
            actorEmail: currentUser.Email ?? "unknown",
            previousStatus: previousStatus,
            detail: request.Note);

        dbContext.GstReturnAudits.Add(audit);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
