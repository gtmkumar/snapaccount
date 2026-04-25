using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using AccountingService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IAccountRepository"/>.
/// </summary>
public sealed class AccountRepository(AccountingDbContext dbContext) : IAccountRepository
{
    /// <inheritdoc />
    public Task<Account?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.Accounts.FirstOrDefaultAsync(a => a.Id == id, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Account>> GetByOrganizationAsync(Guid organizationId, CancellationToken ct = default)
        => await dbContext.Accounts
            .Where(a => a.OrganizationId == organizationId)
            .OrderBy(a => a.AccountCode)
            .ToListAsync(ct);

    /// <inheritdoc />
    public async Task<Account> AddAsync(Account account, CancellationToken ct = default)
    {
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(ct);
        return account;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(Account account, CancellationToken ct = default)
    {
        dbContext.Accounts.Update(account);
        await dbContext.SaveChangesAsync(ct);
    }
}
