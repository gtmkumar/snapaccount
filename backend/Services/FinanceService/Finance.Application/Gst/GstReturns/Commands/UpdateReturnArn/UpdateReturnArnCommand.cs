using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.UpdateReturnArn;

/// <summary>
/// DG-GST-02: Captures or corrects the ARN for a filed GST return.
/// Mapped to PATCH /gst/returns/{id}/arn.
/// Frontend contract: { arn: string } → { arn, savedAt, savedBy }.
/// </summary>
[RequiresPermission("gst.returns.file")]
public record UpdateReturnArnCommand(Guid GstReturnId, string Arn) : ICommand<UpdateReturnArnResponse>;

/// <summary>Response matching the frontend <c>ArnSaveResponseSchema</c>.</summary>
public record UpdateReturnArnResponse(string Arn, string SavedAt, string SavedBy);

/// <summary>Validates the ARN update command.</summary>
public sealed class UpdateReturnArnCommandValidator : AbstractValidator<UpdateReturnArnCommand>
{
    public UpdateReturnArnCommandValidator()
    {
        RuleFor(x => x.GstReturnId).NotEmpty();
        RuleFor(x => x.Arn)
            .NotEmpty()
            .MaximumLength(50)
            .WithMessage("ARN must not be empty and must not exceed 50 characters.");
    }
}

/// <summary>
/// Handles ARN capture / correction on a FILED GST return.
/// Records a <see cref="GstReturnAudit"/> row so the audit trail captures the ARN_UPDATED event.
/// </summary>
public sealed class UpdateReturnArnCommandHandler(
    IGstReturnRepository repository,
    IGstDbContext dbContext,
    ICurrentUser currentUser)
    : ICommandHandler<UpdateReturnArnCommand, UpdateReturnArnResponse>
{
    /// <inheritdoc />
    public async Task<Result<UpdateReturnArnResponse>> Handle(
        UpdateReturnArnCommand request,
        CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result<UpdateReturnArnResponse>.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        // Org-scoping IDOR guard: caller must belong to the same org as the return
        if (currentUser.OrganizationId.HasValue && gstReturn.OrganizationId != currentUser.OrganizationId.Value)
            return Result<UpdateReturnArnResponse>.Failure(Error.Forbidden("GstReturn.Forbidden",
                "You do not have access to this GST return."));

        var updateResult = gstReturn.UpdateArn(request.Arn);
        if (updateResult.IsFailure)
            return Result<UpdateReturnArnResponse>.Failure(updateResult.Error);

        await repository.UpdateAsync(gstReturn, cancellationToken);

        // DG-GST-02: append audit row for the ARN update
        var actorEmail = currentUser.Email ?? "unknown";
        var audit = GstReturnAudit.RecordArnUpdate(
            gstReturnId: gstReturn.Id,
            actorUserId: currentUser.UserId,
            actorEmail: actorEmail,
            newArn: request.Arn);

        dbContext.GstReturnAudits.Add(audit);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new UpdateReturnArnResponse(
            Arn: request.Arn,
            SavedAt: audit.Timestamp.ToString("O"),
            SavedBy: actorEmail);
    }
}
