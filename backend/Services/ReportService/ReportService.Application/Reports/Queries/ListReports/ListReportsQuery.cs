using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ReportService.Application.Reports.Queries.ListReports;

/// <summary>Returns paginated report jobs for the caller's organisation.</summary>
public record ListReportsQuery(
    string? ReportType = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<IReadOnlyList<ReportJobSummaryDto>>;

/// <summary>Summary DTO for list views.</summary>
public record ReportJobSummaryDto(
    Guid JobId,
    string ReportType,
    string Format,
    string Status,
    string? FinancialYear,
    int? PageCount,
    DateTime? CompletedAt,
    DateTime CreatedAt);

/// <summary>Handler: returns paginated report job list for org.</summary>
public sealed class ListReportsQueryHandler(
    IReportServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListReportsQuery, IReadOnlyList<ReportJobSummaryDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<ReportJobSummaryDto>>> Handle(
        ListReportsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var query = db.ReportJobs
            .Where(j => j.OrgId == orgId && j.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.ReportType) &&
            Enum.TryParse<ReportType>(request.ReportType, true, out var rtEnum))
            query = query.Where(j => j.ReportType == rtEnum);

        if (!string.IsNullOrEmpty(request.Status) &&
            Enum.TryParse<ReportJobStatus>(request.Status, true, out var statusEnum))
            query = query.Where(j => j.Status == statusEnum);

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var jobs = await query
            .OrderByDescending(j => j.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(j => new ReportJobSummaryDto(
                j.Id,
                j.ReportType.ToString(),
                j.Format.ToString(),
                j.Status.ToString(),
                j.FinancialYear,
                j.PageCount,
                j.CompletedAt,
                j.CreatedAt))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<ReportJobSummaryDto>>.Success(jobs);
    }
}
