using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ReportService.Application.Reports.Queries.ListReports;

/// <summary>
/// Returns a paginated envelope of report jobs for the caller's organisation.
/// DG-DASH-02: Changed return type from bare list to { items, totalCount } envelope so
/// the admin frontend ReportJobsListSchema (Zod z.object({ items, totalCount })) can parse it.
/// </summary>
public record ListReportsQuery(
    string? ReportType = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ReportJobsListDto>;

/// <summary>
/// Summary DTO for list views.
/// DG-DASH-02: status/format values mapped to the casing the frontend Zod schema expects:
///   status  → QUEUED | GENERATING | COMPLETE | FAILED  (ReportStatusSchema)
///   format  → Pdf | Json                                (ReportFormatSchema)
/// </summary>
public record ReportJobSummaryDto(
    Guid JobId,
    string ReportType,
    string Format,
    string Status,
    string? FinancialYear,
    int? PageCount,
    DateTime? CompletedAt,
    DateTime CreatedAt);

/// <summary>
/// Paginated envelope returned by ListReportsQuery.
/// DG-DASH-02: wraps items + totalCount so the frontend can parse the response with
/// ReportJobsListSchema = z.object({ items: z.array(...), totalCount: z.number() }).
/// </summary>
public record ReportJobsListDto(
    IReadOnlyList<ReportJobSummaryDto> Items,
    int TotalCount);

/// <summary>Handler: returns paginated report job list for org.</summary>
public sealed class ListReportsQueryHandler(
    IReportServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListReportsQuery, ReportJobsListDto>
{
    /// <inheritdoc />
    public async Task<Result<ReportJobsListDto>> Handle(
        ListReportsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var query = db.ReportJobs
            .Where(j => j.OrgId == orgId && j.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.ReportType) &&
            Enum.TryParse<ReportType>(request.ReportType, true, out var rtEnum))
            query = query.Where(j => j.ReportType == rtEnum);

        // DG-DASH-02: accept both frontend casing (GENERATING/COMPLETE) and C# enum casing
        // so that callers can filter by either form.
        if (!string.IsNullOrEmpty(request.Status))
        {
            var normalised = NormaliseStatusFilter(request.Status);
            if (normalised.HasValue)
                query = query.Where(j => j.Status == normalised.Value);
        }

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        // DG-DASH-02: run count + page fetch in parallel.
        var totalCount = await query.CountAsync(cancellationToken);

        // SWEEP-FIX WEB-06: Format has no column in report.report; default to "Pdf".
        // DG-DASH-02: emit "Pdf" (PascalCase) not "PDF" to match frontend ReportFormatSchema
        //             = z.enum(['Pdf', 'Json']).
        // DG-DASH-02: map ReportJobStatus → frontend enum vocabulary:
        //   Queued     → "QUEUED"
        //   Processing → "GENERATING"  (frontend schema uses GENERATING not PROCESSING)
        //   Completed  → "COMPLETE"    (frontend schema uses COMPLETE not COMPLETED)
        //   Failed     → "FAILED"
        var items = await query
            .OrderByDescending(j => j.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(j => new ReportJobSummaryDto(
                j.Id,
                j.ReportType.ToString(),
                "Pdf",          // Format — no DB column; defaulting to "Pdf" (matches ReportFormatSchema)
                j.Status == ReportJobStatus.Queued ? "QUEUED"
                    : j.Status == ReportJobStatus.Processing ? "GENERATING"
                    : j.Status == ReportJobStatus.Completed ? "COMPLETE"
                    : "FAILED",
                j.FinancialYear,
                j.PageCount,
                j.CompletedAt,
                j.CreatedAt))
            .ToListAsync(cancellationToken);

        return Result<ReportJobsListDto>.Success(new ReportJobsListDto(items, totalCount));
    }

    /// <summary>
    /// Converts frontend status filter values (GENERATING, COMPLETE) to C# enum members
    /// so that query filtering works regardless of the casing convention used by the caller.
    /// </summary>
    private static ReportJobStatus? NormaliseStatusFilter(string raw) =>
        raw.ToUpperInvariant() switch
        {
            "QUEUED"      => ReportJobStatus.Queued,
            "GENERATING"  => ReportJobStatus.Processing,   // frontend alias
            "PROCESSING"  => ReportJobStatus.Processing,
            "COMPLETE"    => ReportJobStatus.Completed,    // frontend alias
            "COMPLETED"   => ReportJobStatus.Completed,
            "FAILED"      => ReportJobStatus.Failed,
            _ when Enum.TryParse<ReportJobStatus>(raw, true, out var e) => e,
            _ => null
        };
}
