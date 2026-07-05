using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="ILedgerEntryRepository"/>.</summary>
public sealed class LedgerEntryRepository(AccountingDbContext dbContext) : ILedgerEntryRepository
{
    /// <inheritdoc />
    public Task<LedgerEntry?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.LedgerEntries.FirstOrDefaultAsync(e => e.Id == id && e.DeletedAt == null, ct);

    /// <inheritdoc />
    public Task<LedgerEntry?> GetByDedupeHashAsync(string dedupeHash, CancellationToken ct = default)
        => dbContext.LedgerEntries.FirstOrDefaultAsync(e => e.DedupeHash == dedupeHash, ct);

    /// <inheritdoc />
    public async Task<LedgerEntry> AddAsync(LedgerEntry entry, CancellationToken ct = default)
    {
        dbContext.LedgerEntries.Add(entry);
        await dbContext.SaveChangesAsync(ct);
        return entry;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(LedgerEntry entry, CancellationToken ct = default)
    {
        dbContext.LedgerEntries.Update(entry);
        await dbContext.SaveChangesAsync(ct);
    }
}
