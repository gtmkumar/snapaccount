using FluentValidation;
using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Notices.Queries.ListNotices;

/// <summary>
/// Returns paginated ITR notices for the admin Notice Tracker tab.
/// Org-scoped via filings → assessees belonging to the caller's organisation.
/// </summary>
[RequiresPermission("admin.itr.read")]
public record ListNoticesQuery(
    Guid? AssesseeId = null,
    Guid? FilingId = null,
    string? Status = null,
    string? AssessmentYear = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListNoticesResponse>;

/// <summary>Paginated ITR notices list — shape matches <c>ItrNoticesListSchema</c> in the admin client.</summary>
public record ListNoticesResponse(
    IReadOnlyList<ItrNoticeListItemDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>ITR notice row for the admin Notice Tracker table.</summary>
public record ItrNoticeListItemDto(
    Guid Id,
    Guid? FilingId,
    Guid AssesseeId,
    string NoticeNumber,
    string NoticeType,
    string? NoticeSection,
    string IssuedDate,
    string? DueDate,
    string? Subject,
    string Status,
    string? Severity,
    decimal? DemandAmount,
    Guid? AssignedCaId,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed class ListNoticesQueryValidator : AbstractValidator<ListNoticesQuery>
{
    public ListNoticesQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

public sealed class ListNoticesQueryHandler(IItrDbContext db, ICurrentUser currentUser)
    : IQueryHandler<ListNoticesQuery, ListNoticesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListNoticesResponse>> Handle(
        ListNoticesQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (orgId is null || orgId == Guid.Empty)
            return Result<ListNoticesResponse>.Failure(
                Error.Validation("ITR.MissingOrg",
                    "Organization context missing from session. Complete business onboarding and call POST /auth/token/refresh-context first."));

        var orgAssesseeIds = db.Assessees
            .Where(a => a.OrganizationId == orgId && a.DeletedAt == null)
            .Select(a => a.Id);

        var orgFilingIds = db.Filings
            .Where(f => orgAssesseeIds.Contains(f.AssesseeId) && f.DeletedAt == null)
            .Select(f => f.Id);

        var q = db.ItrNotices
            .Where(n => n.DeletedAt == null && orgFilingIds.Contains(n.FilingId));

        if (request.AssesseeId.HasValue)
            q = q.Where(n => n.AssesseeId == request.AssesseeId.Value);

        if (request.FilingId.HasValue)
            q = q.Where(n => n.FilingId == request.FilingId.Value);

        if (!string.IsNullOrWhiteSpace(request.AssessmentYear))
            q = q.Where(n => EF.Property<string>(n, "Ay") == request.AssessmentYear);

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var dbStatuses = ItrNoticeStatusMapper.ExpandFilter(request.Status);
            q = q.Where(n => dbStatuses.Contains(n.Status));
        }

        var total = await q.CountAsync(cancellationToken);

        var rows = await q
            .OrderByDescending(n => n.IssuedDate)
            .ThenByDescending(n => n.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(n => new
            {
                n.Id,
                n.FilingId,
                n.AssesseeId,
                NoticeNumber = n.NoticeNumber ?? string.Empty,
                n.NoticeType,
                NoticeSection = EF.Property<string>(n, "NoticeSection"),
                n.IssuedDate,
                n.DueDate,
                n.Subject,
                n.Status,
                Priority = EF.Property<string>(n, "Priority"),
                DemandAmount = EF.Property<decimal?>(n, "DemandAmount"),
                n.AssignedCaId,
                n.CreatedAt,
                n.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(r => new ItrNoticeListItemDto(
            r.Id,
            r.FilingId,
            r.AssesseeId,
            r.NoticeNumber,
            r.NoticeType,
            r.NoticeSection,
            r.IssuedDate.ToString("yyyy-MM-dd"),
            r.DueDate?.ToString("yyyy-MM-dd"),
            r.Subject,
            ItrNoticeStatusMapper.ToApiStatus(r.Status),
            ItrNoticeStatusMapper.ToApiSeverity(r.Priority),
            r.DemandAmount,
            r.AssignedCaId,
            r.CreatedAt,
            r.UpdatedAt)).ToList();

        return new ListNoticesResponse(items, total, request.Page, request.PageSize);
    }
}

/// <summary>Maps itr.notices DB status/priority values to the admin API contract.</summary>
internal static class ItrNoticeStatusMapper
{
    /// <summary>Maps a DB status label to the four-value admin enum.</summary>
    public static string ToApiStatus(string dbStatus) => dbStatus switch
    {
        "ACKNOWLEDGED" => "RECEIVED",
        "ASSIGNED" or "IN_PROGRESS" or "RESPONSE_DRAFTED" => "UNDER_REVIEW",
        "RESPONSE_FILED" or "RESOLVED" or "APPEALED" => "RESPONDED",
        "CLOSED" => "CLOSED",
        _ => "RECEIVED",
    };

    /// <summary>Maps DB priority to admin severity chip values.</summary>
    public static string? ToApiSeverity(string priority) => priority switch
    {
        "HIGH" or "URGENT" => "HIGH",
        "NORMAL" => "MEDIUM",
        "LOW" => "LOW",
        _ => null,
    };

    /// <summary>Expands an admin status filter to matching DB status labels.</summary>
    public static IReadOnlyList<string> ExpandFilter(string apiStatus) => apiStatus switch
    {
        "RECEIVED" => ["RECEIVED", "ACKNOWLEDGED"],
        "UNDER_REVIEW" => ["ASSIGNED", "IN_PROGRESS", "RESPONSE_DRAFTED"],
        "RESPONDED" => ["RESPONSE_FILED", "RESOLVED", "APPEALED"],
        "CLOSED" => ["CLOSED"],
        _ => [apiStatus],
    };
}
