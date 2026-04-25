using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace ReportService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for ReportService. Schema isolated to 'report.*'.
/// </summary>
public sealed class ReportServiceDbContext(DbContextOptions<ReportServiceDbContext> options)
    : BaseDbContext(options), IReportServiceDbContext
{
    /// <inheritdoc />
    public DbSet<ReportJob> ReportJobs => Set<ReportJob>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("report");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ReportServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
