using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Queries.GetNotice;

/// <summary>
/// Returns details of a single GST notice including attachments metadata.
/// Phase 6B: replaces the 501 stub for GET /gst/notices/{id}.
/// SEC-038: org-scoped EF filter prevents cross-org IDOR.
/// </summary>
public record GetNoticeQuery(Guid NoticeId) : IQuery<NoticeDetailDto>;

/// <summary>
/// Full notice detail including attachments_jsonb metadata.
/// GAP-108: includes FormType, deadline computation, and GSTAT appeal fields.
/// </summary>
public record NoticeDetailDto(
    Guid Id,
    Guid OrganizationId,
    string NoticeNumber,
    string NoticeType,
    string FormType,
    string? IssuedBy,
    string Status,
    DateOnly IssuedDate,
    DateOnly? StatutoryDeadline,
    DateOnly? DueDate,
    bool DeadlineOverridden,
    int? DaysRemaining,
    bool IsOverdue,
    string? Description,
    Guid? AssignedCaId,
    DateTime? RespondedAt,
    Guid? RespondedBy,
    string? AttachmentsJson,
    string? ResponseAttachmentsJson,
    // Appeal tracking (GAP-108)
    string AppealStage,
    DateOnly? AppealDeadline,
    int? AppealDaysRemaining,
    bool IsGstatBacklogFlagged);

/// <summary>Validator for get notice query.</summary>
public sealed class GetNoticeQueryValidator : AbstractValidator<GetNoticeQuery>
{
    public GetNoticeQueryValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
    }
}

/// <summary>Handler for <see cref="GetNoticeQuery"/>.</summary>
public sealed class GetNoticeQueryHandler(
    IGstDbContext dbContext,
    ICurrentUser currentUser,
    IGstServiceOptions options)
    : IQueryHandler<GetNoticeQuery, NoticeDetailDto>
{

    /// <inheritdoc />
    public async Task<Result<NoticeDetailDto>> Handle(
        GetNoticeQuery request,
        CancellationToken cancellationToken)
    {
        // SEC-038: inline org filter — avoids existence leak (returns NotFound, not Forbidden)
        var notice = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstNotices.Where(n =>
                    n.Id == request.NoticeId &&
                    n.OrganizationId == currentUser.OrganizationId &&
                    n.DeletedAt == null),
                cancellationToken);

        if (notice is null)
            return Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var effective = notice.DueDate ?? notice.StatutoryDeadline;
        int? daysRemaining = effective.HasValue ? effective.Value.DayNumber - today.DayNumber : null;
        bool isOverdue = daysRemaining.HasValue && daysRemaining.Value < 0;
        int? appealDaysRemaining = notice.AppealDeadline.HasValue
            ? notice.AppealDeadline.Value.DayNumber - today.DayNumber
            : null;

        var backlogDeadline = options.GstatBacklogAppealDeadline;

        var isGstatFlagged = notice.IsGstatBacklogFlagged
            || (notice.AppealStage == GstService.Domain.Enums.GstNoticeAppealStage.ORDER_RECEIVED
             && notice.AppealDeadline.HasValue
             && notice.AppealDeadline.Value <= backlogDeadline);

        return new NoticeDetailDto(
            notice.Id,
            notice.OrganizationId,
            notice.NoticeNumber,
            notice.NoticeType,
            notice.FormType.ToString(),
            notice.IssuedBy,
            notice.Status,
            notice.IssuedDate,
            notice.StatutoryDeadline,
            notice.DueDate,
            notice.DeadlineOverridden,
            daysRemaining,
            isOverdue,
            notice.Description,
            notice.AssignedCaId,
            notice.RespondedAt,
            notice.RespondedBy,
            notice.AttachmentsJson,
            notice.ResponseAttachmentsJson,
            notice.AppealStage.ToString(),
            notice.AppealDeadline,
            appealDaysRemaining,
            isGstatFlagged);
    }
}
