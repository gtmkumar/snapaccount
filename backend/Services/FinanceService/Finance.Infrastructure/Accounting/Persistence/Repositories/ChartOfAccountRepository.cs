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

    /// <inheritdoc />
    public async Task AddRangeAsync(IEnumerable<ChartOfAccount> accounts, CancellationToken ct = default)
    {
        // Bootstrap is additive/idempotent (existing codes are filtered out by the caller), so it
        // is safe to commit in chunks rather than one giant transaction — this bounds statement
        // size and lock duration if a template ever grows very large. Realistic charts are ~30-60
        // rows (a single chunk), collapsing what used to be one SaveChanges *per account* into one.
        const int chunkSize = 500;
        var buffer = new List<ChartOfAccount>(chunkSize);
        foreach (var account in accounts)
        {
            buffer.Add(account);
            if (buffer.Count == chunkSize)
            {
                dbContext.ChartOfAccounts.AddRange(buffer);
                await dbContext.SaveChangesAsync(ct);
                buffer.Clear();
            }
        }

        if (buffer.Count > 0)
        {
            dbContext.ChartOfAccounts.AddRange(buffer);
            await dbContext.SaveChangesAsync(ct);
        }
    }

    /// <inheritdoc />
    public async Task<ChartOfAccount?> GetByOrganizationAndCodeAsync(
        Guid orgId, string accountCode, CancellationToken ct = default)
        => await dbContext.ChartOfAccounts
            .FirstOrDefaultAsync(
                a => a.OrgId == orgId
                    && a.AccountCode == accountCode
                    && a.IsActive
                    && a.DeletedAt == null,
                ct);
}
