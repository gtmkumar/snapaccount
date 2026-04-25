using FluentValidation;
using GstService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Queries.ListNotices;

/// <summary>
/// Returns paginated GST notices for an organisation.
/// Filters by status (RECEIVED, UNDER_REVIEW, RESPONDED, CLOSED) if provided.
/// Phase 6B: replaces the 501 stub for GET /gst/notices.
/// </summary>
public record ListNoticesQuery(
    Guid OrganizationId,
    string? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListNoticesResponse>;

/// <summary>Paginated notices response.</summary>
public record ListNoticesResponse(
    IReadOnlyList<NoticeDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Notice summary DTO for list view.</summary>
public record NoticeDto(
    Guid Id,
    string NoticeNumber,
    string NoticeType,
    string Status,
    DateOnly IssuedDate,
    DateOnly? DueDate,
    string? Description,
    Guid? AssignedCaId,
    DateTime? RespondedAt);

/// <summary>Validator for list notices query.</summary>
public sealed class ListNoticesQueryValidator : AbstractValidator<ListNoticesQuery>
{
    private static readonly string[] ValidStatuses = ["RECEIVED", "UNDER_REVIEW", "RESPONDED", "CLOSED"];

    public ListNoticesQueryValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        When(x => x.Status is not null, () =>
            RuleFor(x => x.Status).Must(s => ValidStatuses.Contains(s))
                .WithMessage($"Status must be one of: {string.Join(", ", ValidStatuses)}"));
    }
}

/// <summary>Handler for <see cref="ListNoticesQuery"/>.</summary>
public sealed class ListNoticesQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<ListNoticesQuery, ListNoticesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListNoticesResponse>> Handle(
        ListNoticesQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.GstNotices
            .Where(n => n.OrganizationId == request.OrganizationId && n.DeletedAt == null);

        if (request.Status is not null)
            query = query.Where(n => n.Status == request.Status);

        var totalCount = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .CountAsync(query, cancellationToken);

        var items = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .ToListAsync(
                query.OrderByDescending(n => n.IssuedDate)
                     .Skip((request.Page - 1) * request.PageSize)
                     .Take(request.PageSize),
                cancellationToken);

        var dtos = items.Select(n => new NoticeDto(
            n.Id,
            n.NoticeNumber,
            n.NoticeType,
            n.Status,
            n.IssuedDate,
            n.DueDate,
            n.Description,
            n.AssignedCaId,
            n.RespondedAt)).ToList();

        return new ListNoticesResponse(dtos, totalCount, request.Page, request.PageSize);
    }
}
