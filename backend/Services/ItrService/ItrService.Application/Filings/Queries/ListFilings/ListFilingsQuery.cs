using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Queries.ListFilings;

/// <summary>
/// Returns paginated filings for an assessee.
/// SEC-039: org-scoped — verifies the requested assessee belongs to caller's organisation
/// before listing. Returns empty list (not error) if assessee is from a different org.
/// </summary>
public record ListFilingsQuery(Guid AssesseeId, string? Status = null, int Page = 1, int PageSize = 20) : IQuery<ListFilingsResponse>;

public record ListFilingsResponse(IReadOnlyList<FilingSummaryDto> Items, int TotalCount, int Page, int PageSize);

public record FilingSummaryDto(Guid Id, string AssessmentYear, string ItrFormType, string Regime, string Status, decimal? PayableOrRefund, DateTime? FiledAt);

public sealed class ListFilingsQueryValidator : AbstractValidator<ListFilingsQuery>
{
    public ListFilingsQueryValidator()
    {
        RuleFor(x => x.AssesseeId).NotEmpty();
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 50);
    }
}

public sealed class ListFilingsQueryHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<ListFilingsQuery, ListFilingsResponse>
{
    public async Task<Result<ListFilingsResponse>> Handle(ListFilingsQuery request, CancellationToken cancellationToken)
    {
        // SEC-039: verify assessee belongs to caller's org before listing their filings
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.Assessees.Where(a => a.Id == request.AssesseeId && a.DeletedAt == null),
                cancellationToken);

        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return new ListFilingsResponse([], 0, request.Page, request.PageSize);

        var q = dbContext.Filings.Where(f => f.AssesseeId == request.AssesseeId && f.DeletedAt == null);
        if (request.Status is not null) q = q.Where(f => f.Status == request.Status);

        var total = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.CountAsync(q, cancellationToken);
        var items = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            q.OrderByDescending(f => f.AssessmentYear).Skip((request.Page - 1) * request.PageSize).Take(request.PageSize),
            cancellationToken);

        var dtos = items.Select(f =>
        {
            decimal? payable = null;
            // Extract payable from computation jsonb if available
            return new FilingSummaryDto(f.Id, f.AssessmentYear, f.ItrFormType, f.Regime, f.Status, payable, f.FiledAt);
        }).ToList();

        return new ListFilingsResponse(dtos, total, request.Page, request.PageSize);
    }
}
