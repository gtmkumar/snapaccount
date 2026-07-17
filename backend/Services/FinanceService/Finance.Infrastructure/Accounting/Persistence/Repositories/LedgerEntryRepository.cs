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
    public async Task AddRangeAsync(IEnumerable<LedgerEntry> entries, CancellationToken ct = default)
    {
        // Double-entry postings must commit atomically, so all lines go in ONE transaction (one
        // SaveChanges) — never chunked into separate commits. EF Core + Npgsql still batch the
        // INSERTs into multi-row commands under the hood (MaxBatchSize), so this is a handful of
        // round trips rather than one-per-entry (the previous foreach + AddAsync behaviour).
        dbContext.LedgerEntries.AddRange(entries);
        await dbContext.SaveChangesAsync(ct);
    }

    /// <inheritdoc />
    public async Task UpdateAsync(LedgerEntry entry, CancellationToken ct = default)
    {
        dbContext.LedgerEntries.Update(entry);
        await dbContext.SaveChangesAsync(ct);
    }
}
