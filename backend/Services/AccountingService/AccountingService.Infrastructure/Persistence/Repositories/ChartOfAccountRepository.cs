using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IChartOfAccountRepository"/>.</summary>
public sealed class ChartOfAccountRepository(AccountingDbContext dbContext) : IChartOfAccountRepository
{
    /// <inheritdoc />
    public async Task<IReadOnlyList<ChartOfAccount>> GetByOrganizationAsync(Guid orgId, CancellationToken ct = default)
        => await dbContext.ChartOfAccounts
            .Where(a => a.OrgId == orgId && a.IsActive && a.DeletedAt == null)
            .OrderBy(a => a.AccountCode)
            .ToListAsync(ct);

    /// <inheritdoc />
    public async Task<ChartOfAccount> AddAsync(ChartOfAccount account, CancellationToken ct = default)
    {
        dbContext.ChartOfAccounts.Add(account);
        await dbContext.SaveChangesAsync(ct);
        return account;
    }
}
