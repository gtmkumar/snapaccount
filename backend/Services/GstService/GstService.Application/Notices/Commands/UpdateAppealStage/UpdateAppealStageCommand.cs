using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Commands.UpdateAppealStage;

/// <summary>
/// Updates the GSTAT appeal stage for a notice.
/// GAP-108: migration 084.
///
/// Valid forward transitions (backward transitions rejected):
///   NONE → REPLY_FILED → ORDER_RECEIVED → APPEAL_FILED → GSTAT_PENDING → RESOLVED
///
/// When transitioning to ORDER_RECEIVED, <paramref name="OrderDate"/> is required
/// to compute the 90-day appeal deadline.
///
/// GSTAT backlog flag: when stage moves to ORDER_RECEIVED and AppealDeadline &gt;= config
/// backlog date (default 2026-06-30) the notice is flagged as GSTAT-backlog-eligible.
///
/// SEC-038: org-scoped fetch prevents cross-org IDOR.
/// </summary>
[RequiresPermission("gst.notices.update")]
public record UpdateAppealStageCommand(
    Guid NoticeId,
    GstNoticeAppealStage NewStage,
    DateOnly? OrderDate,
    int? AppealWindowDaysOverride) : ICommand<UpdateAppealStageResponse>;

/// <summary>Response after updating appeal stage.</summary>
public record UpdateAppealStageResponse(
    Guid NoticeId,
    string AppealStage,
    DateOnly? AppealDeadline,
    bool IsGstatBacklogFlagged);

/// <summary>Validator for <see cref="UpdateAppealStageCommand"/>.</summary>
public sealed class UpdateAppealStageCommandValidator : AbstractValidator<UpdateAppealStageCommand>
{
    public UpdateAppealStageCommandValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
        RuleFor(x => x.NewStage).IsInEnum();

        RuleFor(x => x.OrderDate)
            .NotNull()
            .WithMessage("OrderDate is required when transitioning to ORDER_RECEIVED.")
            .When(x => x.NewStage == GstNoticeAppealStage.ORDER_RECEIVED);

        RuleFor(x => x.AppealWindowDaysOverride)
            .GreaterThan(0)
            .When(x => x.AppealWindowDaysOverride.HasValue);
    }
}

/// <summary>Handler for <see cref="UpdateAppealStageCommand"/>.</summary>
public sealed class UpdateAppealStageCommandHandler(
    IGstDbContext dbContext,
    ICurrentUser currentUser,
    IGstServiceOptions options)
    : ICommandHandler<UpdateAppealStageCommand, UpdateAppealStageResponse>
{

    /// <inheritdoc />
    public async Task<Result<UpdateAppealStageResponse>> Handle(
        UpdateAppealStageCommand request,
        CancellationToken cancellationToken)
    {
        // SEC-038: org-scoped fetch
        var notice = await dbContext.GstNotices
            .Where(n => n.Id == request.NoticeId
                     && n.OrganizationId == currentUser.OrganizationId
                     && n.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (notice is null)
            return Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found.");

        // Validate forward-only transition
        if (!IsForwardTransition(notice.AppealStage, request.NewStage))
            return Result<UpdateAppealStageResponse>.Failure(Error.Conflict(
                "GstNotice.InvalidAppealTransition",
                $"Cannot transition appeal stage from {notice.AppealStage} to {request.NewStage}. " +
                "Only forward transitions are allowed."));

        // Apply stage transition
        switch (request.NewStage)
        {
            case GstNoticeAppealStage.REPLY_FILED:
                // Allow direct set — FileResponse also sets this; this allows explicit override
                break;

            case GstNoticeAppealStage.ORDER_RECEIVED:
                var orderDate = request.OrderDate!.Value;
                var appealWindowDays = request.AppealWindowDaysOverride ?? 90;
                notice.RecordOrderReceived(orderDate, appealWindowDays);
                break;

            case GstNoticeAppealStage.APPEAL_FILED:
                notice.RecordAppealFiled();
                break;

            case GstNoticeAppealStage.GSTAT_PENDING:
                notice.RecordGstatPending();
                break;

            case GstNoticeAppealStage.RESOLVED:
                notice.ResolveAppeal();
                break;
        }

        // GAP-108: Evaluate GSTAT backlog flag
        // Flag is set when stage = ORDER_RECEIVED and the appeal deadline falls within
        // the config-driven backlog window date.
        var backlogDeadline = options.GstatBacklogAppealDeadline;

        var isFlagged = notice.AppealStage == GstNoticeAppealStage.ORDER_RECEIVED
                     && notice.AppealDeadline.HasValue
                     && notice.AppealDeadline.Value <= backlogDeadline;

        // Store the flag on the entity (computed field helper)
        if (isFlagged)
            notice.SetGstatBacklogFlag(true);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new UpdateAppealStageResponse(
            notice.Id,
            notice.AppealStage.ToString(),
            notice.AppealDeadline,
            notice.IsGstatBacklogFlagged);
    }

    /// <summary>
    /// Only allows progression along the defined appeal stage order.
    /// NONE=0, REPLY_FILED=1, ORDER_RECEIVED=2, APPEAL_FILED=3, GSTAT_PENDING=4, RESOLVED=5.
    /// </summary>
    private static bool IsForwardTransition(GstNoticeAppealStage current, GstNoticeAppealStage next)
        => (int)next > (int)current;
}
