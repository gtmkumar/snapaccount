using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Queries.ListNotices;

/// <summary>
/// Returns paginated GST notices for an organisation.
/// Filters by status (RECEIVED, UNDER_REVIEW, RESPONDED, CLOSED) if provided.
/// Phase 6B: replaces the 501 stub for GET /gst/notices.
/// GAP-108: adds FormType, AppealStage, GstatBacklogOnly filters.
///
/// WEB-FIX: <see cref="OrganizationId"/> is now nullable.
/// When absent the handler defaults to <see cref="ICurrentUser.OrganizationId"/> (the caller's own org).
/// A 400 is only returned if <em>neither</em> is available, preventing the 500 that occurred when
/// the admin GST Notices page called GET /gst/notices without an explicit organizationId.
/// Org-scope enforcement: a non-admin caller can never access another org's notices because
/// <see cref="ICurrentUser.OrganizationId"/> is always taken from verified JWT claims.
/// </summary>
public record ListNoticesQuery(
    Guid? OrganizationId,
    string? Status = null,
    string? FormType = null,
    string? AppealStage = null,
    bool? GstatBacklogOnly = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListNoticesResponse>;

/// <summary>Paginated notices response.</summary>
public record ListNoticesResponse(
    IReadOnlyList<NoticeDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Notice summary DTO for list view. GAP-108: includes FormType, deadline, appeal fields.</summary>
public record NoticeDto(
    Guid Id,
    string NoticeNumber,
    string NoticeType,
    string FormType,
    string Status,
    DateOnly IssuedDate,
    DateOnly? StatutoryDeadline,
    DateOnly? DueDate,
    bool DeadlineOverridden,
    string? Description,
    Guid? AssignedCaId,
    DateTime? RespondedAt,
    string AppealStage,
    DateOnly? AppealDeadline,
    bool IsGstatBacklogFlagged);

/// <summary>Validator for list notices query.</summary>
public sealed class ListNoticesQueryValidator : AbstractValidator<ListNoticesQuery>
{
    private static readonly string[] ValidStatuses = ["RECEIVED", "UNDER_REVIEW", "RESPONDED", "CLOSED"];
    private static readonly string[] ValidFormTypes = Enum.GetNames<GstNoticeFormType>();
    private static readonly string[] ValidAppealStages = Enum.GetNames<GstNoticeAppealStage>();

    public ListNoticesQueryValidator()
    {
        // OrganizationId is optional at query level — handler resolves it from ICurrentUser.
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        When(x => x.Status is not null, () =>
            RuleFor(x => x.Status).Must(s => ValidStatuses.Contains(s!))
                .WithMessage($"Status must be one of: {string.Join(", ", ValidStatuses)}"));
        When(x => x.FormType is not null, () =>
            RuleFor(x => x.FormType).Must(f => ValidFormTypes.Contains(f!))
                .WithMessage($"FormType must be one of: {string.Join(", ", ValidFormTypes)}"));
        When(x => x.AppealStage is not null, () =>
            RuleFor(x => x.AppealStage).Must(a => ValidAppealStages.Contains(a!))
                .WithMessage($"AppealStage must be one of: {string.Join(", ", ValidAppealStages)}"));
    }
}

/// <summary>Handler for <see cref="ListNoticesQuery"/>.</summary>
public sealed class ListNoticesQueryHandler(IGstDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<ListNoticesQuery, ListNoticesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListNoticesResponse>> Handle(
        ListNoticesQuery request,
        CancellationToken cancellationToken)
    {
        // WEB-FIX: resolve org — explicit param wins; fall back to caller's JWT org; 400 if neither.
        var orgId = request.OrganizationId ?? currentUser.OrganizationId;
        if (orgId is null || orgId == Guid.Empty)
            return Result<ListNoticesResponse>.Failure(
                Error.Validation("GstNotice.MissingOrg",
                    "organizationId is required (or complete business onboarding so it is present in your session)."));

        var query = dbContext.GstNotices
            .Where(n => n.OrganizationId == orgId.Value && n.DeletedAt == null);

        if (request.Status is not null)
            query = query.Where(n => n.Status == request.Status);

        // GAP-108: new filters
        if (request.FormType is not null)
        {
            var ft = Enum.Parse<GstNoticeFormType>(request.FormType);
            query = query.Where(n => n.FormType == ft);
        }

        if (request.AppealStage is not null)
        {
            var stage = Enum.Parse<GstNoticeAppealStage>(request.AppealStage);
            query = query.Where(n => n.AppealStage == stage);
        }

        if (request.GstatBacklogOnly == true)
            query = query.Where(n => n.IsGstatBacklogFlagged);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(n => n.IssuedDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        var dtos = items.Select(n => new NoticeDto(
            n.Id,
            n.NoticeNumber,
            n.NoticeType,
            n.FormType.ToString(),
            n.Status,
            n.IssuedDate,
            n.StatutoryDeadline,
            n.DueDate,
            n.DeadlineOverridden,
            n.Description,
            n.AssignedCaId,
            n.RespondedAt,
            n.AppealStage.ToString(),
            n.AppealDeadline,
            n.IsGstatBacklogFlagged)).ToList();

        return new ListNoticesResponse(dtos, totalCount, request.Page, request.PageSize);
    }
}
