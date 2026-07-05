using CallbackService.Application.Internal.Commands.RefreshKpiMv;
using CallbackService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Infrastructure.Internal;

/// <summary>
/// DG-INFRA-04: Infrastructure handler for <see cref="RefreshKpiMvCommand"/>.
/// Lives in Infrastructure (not Application) because it uses <see cref="CallbackDbContext.Database"/>
/// to run <c>REFRESH MATERIALIZED VIEW CONCURRENTLY</c> — a raw SQL operation that cannot
/// go through the EF Core entity abstraction <see cref="ICallbackDbContext"/>.
///
/// The CONCURRENTLY keyword requires <c>uq_kpi_daily_snapshot_org_date</c> unique index,
/// asserted by database migrations 067 and 073.
/// </summary>
public sealed class RefreshKpiMvCommandHandler(
    CallbackDbContext db,
    ILogger<RefreshKpiMvCommandHandler> logger)
    : ICommandHandler<RefreshKpiMvCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RefreshKpiMvCommand request, CancellationToken ct)
    {
        logger.LogInformation(
            "DG-INFRA-04: Running REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot");

        await db.Database.ExecuteSqlRawAsync(
            "REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;", ct);

        logger.LogInformation(
            "DG-INFRA-04: REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot completed.");

        return Result.Success();
    }
}
