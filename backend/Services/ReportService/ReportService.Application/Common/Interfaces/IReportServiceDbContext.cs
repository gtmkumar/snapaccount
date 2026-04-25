using Microsoft.EntityFrameworkCore;
using ReportService.Domain.Entities;

namespace ReportService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the report schema database context.
/// Query handlers use this for direct LINQ projections.
/// </summary>
public interface IReportServiceDbContext
{
    /// <summary>Report generation jobs.</summary>
    DbSet<ReportJob> ReportJobs { get; }

    /// <summary>Persists changes to the report schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
