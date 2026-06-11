using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Queries.GetNoticeDeadline;

/// <summary>
/// Returns the computed deadline information for a specific notice.
/// GAP-108: exposes StatutoryDeadline, DaysRemaining, DeadlineOverridden, and GSTAT backlog flag.
/// SEC-038: org-scoped fetch prevents cross-org IDOR.
/// </summary>
public record GetNoticeDeadlineQuery(Guid NoticeId) : IQuery<NoticeDeadlineDto>;

/// <summary>Full deadline information for a notice.</summary>
public record NoticeDeadlineDto(
    Guid NoticeId,
    string FormType,
    DateOnly NoticeDate,
    string FinancialYear,
    DateOnly? StatutoryDeadline,
    DateOnly? EffectiveDeadline,
    bool DeadlineOverridden,
    int? DaysRemaining,
    bool IsOverdue,
    // Appeal tracking
    string AppealStage,
    DateOnly? AppealDeadline,
    int? AppealDaysRemaining,
    bool IsGstatBacklogFlagged,
    DateOnly GstatBacklogDeadline);

/// <summary>Validator for <see cref="GetNoticeDeadlineQuery"/>.</summary>
public sealed class GetNoticeDeadlineQueryValidator : AbstractValidator<GetNoticeDeadlineQuery>
{
    public GetNoticeDeadlineQueryValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
    }
}

/// <summary>Handler for <see cref="GetNoticeDeadlineQuery"/>.</summary>
public sealed class GetNoticeDeadlineQueryHandler(
    IGstDbContext dbContext,
    IGstNoticeDeadlineService deadlineService,
    ICurrentUser currentUser,
    IGstServiceOptions options)
    : IQueryHandler<GetNoticeDeadlineQuery, NoticeDeadlineDto>
{

    /// <inheritdoc />
    public async Task<Result<NoticeDeadlineDto>> Handle(
        GetNoticeDeadlineQuery request,
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

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var fy = IGstNoticeDeadlineService.GetFinancialYear(notice.IssuedDate);

        // Compute statutory if not yet stamped (lazily — backward compat for pre-084 rows)
        var statutory = notice.StatutoryDeadline;
        if (statutory is null)
        {
            statutory = await deadlineService.ComputeDeadlineAsync(
                notice.FormType, notice.IssuedDate, fy, cancellationToken);
        }

        var effective = notice.DueDate ?? statutory;
        int? daysRemaining = effective.HasValue ? effective.Value.DayNumber - today.DayNumber : null;
        bool isOverdue = daysRemaining.HasValue && daysRemaining.Value < 0;

        // Appeal days remaining
        int? appealDaysRemaining = notice.AppealDeadline.HasValue
            ? notice.AppealDeadline.Value.DayNumber - today.DayNumber
            : null;

        // GSTAT backlog deadline from config (IGstServiceOptions keeps IConfiguration out of Application)
        var backlogDeadline = options.GstatBacklogAppealDeadline;

        var isGstatFlagged = notice.AppealStage == GstNoticeAppealStage.ORDER_RECEIVED
                          && notice.AppealDeadline.HasValue
                          && notice.AppealDeadline.Value <= backlogDeadline;

        return new NoticeDeadlineDto(
            notice.Id,
            notice.FormType.ToString(),
            notice.IssuedDate,
            fy,
            statutory,
            effective,
            notice.DeadlineOverridden,
            daysRemaining,
            isOverdue,
            notice.AppealStage.ToString(),
            notice.AppealDeadline,
            appealDaysRemaining,
            isGstatFlagged || notice.IsGstatBacklogFlagged,
            backlogDeadline);
    }
}
