using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Entities;
using CallbackService.Infrastructure.Persistence.Configurations;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace CallbackService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the callback schema.
/// Implements <see cref="ICallbackDbContext"/> for testability.
/// </summary>
public class CallbackDbContext(DbContextOptions<CallbackDbContext> options)
    : BaseDbContext(options), ICallbackDbContext
{
    public DbSet<Callback> Callbacks => Set<Callback>();
    public DbSet<CallNote> CallNotes => Set<CallNote>();
    public DbSet<AssignmentLog> AssignmentLogs => Set<AssignmentLog>();

    /// <summary>GAP-012: read-only MV projection — keyless, no write operations.</summary>
    public DbSet<KpiDailySnapshot> KpiSnapshots => Set<KpiDailySnapshot>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("callback");
        modelBuilder.ApplyConfigurationsFromAssembly(
            typeof(CallbackDbContext).Assembly,
            type => type.Namespace == typeof(KpiDailySnapshotConfiguration).Namespace);
        base.OnModelCreating(modelBuilder);
    }
}
