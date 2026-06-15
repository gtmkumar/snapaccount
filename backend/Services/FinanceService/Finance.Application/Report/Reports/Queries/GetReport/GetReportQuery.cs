using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ReportService.Application.Reports.Queries.GetReport;

/// <summary>Returns a single report job by ID, scoped to the caller's organisation (IDOR protection).</summary>
public record GetReportQuery(Guid JobId) : IQuery<ReportJobDto>;

/// <summary>Report job DTO — omits GCS paths; provides signed download URL via separate endpoint.</summary>
public record ReportJobDto(
    Guid JobId,
    string ReportType,
    string Format,
    string Status,
    string? FinancialYear,
    DateTime? PeriodStart,
    DateTime? PeriodEnd,
    int? PageCount,
    string? Sha256HashHex,
    string? ErrorMessage,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    DateTime CreatedAt);

/// <summary>Handler: returns report job with IDOR org-scoping.</summary>
public sealed class GetReportQueryHandler(
    IReportServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetReportQuery, ReportJobDto>
{
    /// <inheritdoc />
    public async Task<Result<ReportJobDto>> Handle(
        GetReportQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // SWEEP-FIX WEB-06: Format, Sha256HashHex, StartedAt are EF-ignored (no columns in
        // report.report). Return safe defaults until DDL handoff adds the columns.
        var job = await db.ReportJobs
            .Where(j => j.Id == request.JobId && j.OrgId == orgId && j.DeletedAt == null)
            .Select(j => new ReportJobDto(
                j.Id,
                j.ReportType.ToString(),
                "PDF",              // Format — no DB column yet
                j.Status.ToString(),
                j.FinancialYear,
                j.PeriodStart,
                j.PeriodEnd,
                j.PageCount,
                (string?)null,      // Sha256HashHex — no DB column yet
                j.ErrorMessage,
                (DateTime?)null,    // StartedAt — no DB column yet
                j.CompletedAt,
                j.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (job == null)
            return Error.NotFound("ReportJob", request.JobId);

        return job;
    }
}
