using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CallbackService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the callback schema database context.
/// Command and query handlers depend on this interface.
/// </summary>
public interface ICallbackDbContext
{
    DbSet<Callback> Callbacks { get; }
    DbSet<CallNote> CallNotes { get; }

    /// <summary>SEC-030: callback.assignments_log audit rows.</summary>
    DbSet<AssignmentLog> AssignmentLogs { get; }

    /// <summary>
    /// GAP-012: read-only projection of <c>callback.kpi_daily_snapshot</c> Materialized View.
    /// Never used in Add/Update/Delete — keyless entity.
    /// </summary>
    DbSet<KpiDailySnapshot> KpiSnapshots { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
