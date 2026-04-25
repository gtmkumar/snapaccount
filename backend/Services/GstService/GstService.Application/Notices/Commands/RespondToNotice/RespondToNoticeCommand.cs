using FluentValidation;
using GstService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Commands.RespondToNotice;

/// <summary>
/// Files a response to a GST notice.
/// Accepts GCS URI metadata JSON for any response attachments.
/// Transitions status: UNDER_REVIEW → RESPONDED.
/// Audit-logged to shared.audit_log.
/// Phase 6B: new command.
/// </summary>
[RequiresPermission("gst.notices.respond")]
public record RespondToNoticeCommand(
    Guid NoticeId,
    Guid RespondedByUserId,
    string? ResponseText,
    string? ResponseAttachmentMetadataJson) : ICommand;

/// <summary>Validator for respond-to-notice command.</summary>
public sealed class RespondToNoticeCommandValidator : AbstractValidator<RespondToNoticeCommand>
{
    public RespondToNoticeCommandValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
        RuleFor(x => x.RespondedByUserId).NotEmpty();
        RuleFor(x => x.ResponseText).MaximumLength(5000).When(x => x.ResponseText is not null);
    }
}

/// <summary>Handler for <see cref="RespondToNoticeCommand"/>.</summary>
public sealed class RespondToNoticeCommandHandler(IGstDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<RespondToNoticeCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RespondToNoticeCommand request, CancellationToken cancellationToken)
    {
        var notice = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstNotices.Where(n => n.Id == request.NoticeId && n.DeletedAt == null),
                cancellationToken);

        if (notice is null)
            return Result.Failure(Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found."));

        // SEC-038: post-fetch org ownership check — NotFound (not Forbidden) to avoid existence leak
        if (notice.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found."));

        if (notice.Status is "RESPONDED" or "CLOSED")
            return Result.Failure(Error.Conflict("GstNotice.AlreadyResponded", "This notice has already been responded to."));

        notice.FileResponse(request.RespondedByUserId, request.ResponseAttachmentMetadataJson);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
