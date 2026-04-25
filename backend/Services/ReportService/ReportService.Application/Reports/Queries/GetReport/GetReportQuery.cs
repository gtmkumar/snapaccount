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

        var job = await db.ReportJobs
            .Where(j => j.Id == request.JobId && j.OrgId == orgId && j.DeletedAt == null)
            .Select(j => new ReportJobDto(
                j.Id,
                j.ReportType.ToString(),
                j.Format.ToString(),
                j.Status.ToString(),
                j.FinancialYear,
                j.PeriodStart,
                j.PeriodEnd,
                j.PageCount,
                j.Sha256HashHex,
                j.ErrorMessage,
                j.StartedAt,
                j.CompletedAt,
                j.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (job == null)
            return Error.NotFound("ReportJob", request.JobId);

        return job;
    }
}
