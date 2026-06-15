using FluentValidation;
using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Queries.ListFilings;

/// <summary>
/// Returns paginated ITR filings.
///
/// Two modes:
/// 1. Assessee-scoped (assesseeId provided): returns filings for the given assessee.
///    SEC-039: assessee must belong to caller's org — returns empty list (not 403) to prevent existence leaks.
/// 2. Org-wide (assesseeId absent): returns all filings across all assessees in the caller's org.
///    Requires admin permission (enforced via <see cref="RequiresPermission"/>).
///    Supports <see cref="Status"/> and <see cref="AssessmentYear"/> filter params.
///
/// WEB-FIX: <see cref="AssesseeId"/> is now nullable so the admin ITR page can call
///   GET /itr/filings?status=UNDER_CA_REVIEW&amp;assessmentYear=AY2026-27 without a 400.
/// </summary>
public record ListFilingsQuery(
    Guid? AssesseeId,
    string? Status = null,
    int Page = 1,
    int PageSize = 20,
    string? AssessmentYear = null) : IQuery<ListFilingsResponse>;

public record ListFilingsResponse(IReadOnlyList<FilingSummaryDto> Items, int TotalCount, int Page, int PageSize);

/// <summary>Filing summary DTO for paginated list view.</summary>
public record FilingSummaryDto(
    Guid Id,
    Guid AssesseeId,
    string AssessmentYear,
    string ItrFormType,
    string Regime,
    string Status,
    decimal? PayableOrRefund,
    DateTime? FiledAt);

public sealed class ListFilingsQueryValidator : AbstractValidator<ListFilingsQuery>
{
    public ListFilingsQueryValidator()
    {
        // AssesseeId is optional — absent triggers org-wide mode.
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 50);
    }
}

public sealed class ListFilingsQueryHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<ListFilingsQuery, ListFilingsResponse>
{
    public async Task<Result<ListFilingsResponse>> Handle(ListFilingsQuery request, CancellationToken cancellationToken)
    {
        IQueryable<ItrService.Domain.Entities.Filing> q;

        if (request.AssesseeId.HasValue)
        {
            // Assessee-scoped mode (SEC-039): verify assessee belongs to caller's org.
            // Returns empty list (not 404/403) to prevent existence leaks.
            var assessee = await dbContext.Assessees
                .FirstOrDefaultAsync(
                    a => a.Id == request.AssesseeId.Value
                         && a.DeletedAt == null
                         && a.OrganizationId == currentUser.OrganizationId,
                    cancellationToken);

            if (assessee is null)
                return new ListFilingsResponse([], 0, request.Page, request.PageSize);

            q = dbContext.Filings.Where(f => f.AssesseeId == request.AssesseeId.Value && f.DeletedAt == null);
        }
        else
        {
            // Org-wide mode: join through assessees scoped to the caller's org.
            // The caller must have admin.itr.read (enforced by PermissionBehavior via [RequiresPermission]).
            var orgId = currentUser.OrganizationId;
            if (orgId is null || orgId == Guid.Empty)
                return Result<ListFilingsResponse>.Failure(
                    Error.Validation("ITR.MissingOrg",
                        "Organization context missing from session. Complete business onboarding and call POST /auth/token/refresh-context first."));

            // Scope filings to assessees that belong to the caller's org.
            var orgAssesseeIds = dbContext.Assessees
                .Where(a => a.OrganizationId == orgId && a.DeletedAt == null)
                .Select(a => a.Id);

            q = dbContext.Filings
                .Where(f => orgAssesseeIds.Contains(f.AssesseeId) && f.DeletedAt == null);
        }

        // Apply optional filters (used by both modes).
        if (request.Status is not null)
            q = q.Where(f => f.Status == request.Status);

        if (request.AssessmentYear is not null)
            q = q.Where(f => f.AssessmentYear == request.AssessmentYear);

        var total = await q.CountAsync(cancellationToken);
        var items = await q
            .OrderByDescending(f => f.AssessmentYear)
            .ThenByDescending(f => f.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        var dtos = items.Select(f =>
            new FilingSummaryDto(f.Id, f.AssesseeId, f.AssessmentYear, f.ItrFormType, f.Regime, f.Status, null, f.FiledAt)
        ).ToList();

        return new ListFilingsResponse(dtos, total, request.Page, request.PageSize);
    }
}
