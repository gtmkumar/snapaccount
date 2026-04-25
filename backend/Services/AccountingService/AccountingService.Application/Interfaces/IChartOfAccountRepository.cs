using AccountingService.Domain.Entities;

namespace AccountingService.Application.Interfaces;

/// <summary>Repository contract for <see cref="ChartOfAccount"/> per-org entries.</summary>
public interface IChartOfAccountRepository
{
    /// <summary>Returns all active chart-of-accounts entries for an org.</summary>
    Task<IReadOnlyList<ChartOfAccount>> GetByOrganizationAsync(Guid orgId, CancellationToken ct = default);

    /// <summary>Persists a new COA entry.</summary>
    Task<ChartOfAccount> AddAsync(ChartOfAccount account, CancellationToken ct = default);
}
