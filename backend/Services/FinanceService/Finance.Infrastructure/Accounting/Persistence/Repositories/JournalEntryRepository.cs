using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using AccountingService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IJournalEntryRepository"/>.
/// Commands use this repository exclusively; query handlers access
/// <see cref="AccountingDbContext"/> directly for lean projections (JT CQRS).
/// </summary>
public sealed class JournalEntryRepository(AccountingDbContext dbContext) : IJournalEntryRepository
{
    /// <inheritdoc />
    public Task<JournalEntry?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.JournalEntries
            .Include(e => e.Lines)
            .FirstOrDefaultAsync(e => e.Id == id, ct);

    /// <inheritdoc />
    public async Task<JournalEntry> AddAsync(JournalEntry entry, CancellationToken ct = default)
    {
        dbContext.JournalEntries.Add(entry);
        await dbContext.SaveChangesAsync(ct);
        return entry;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(JournalEntry entry, CancellationToken ct = default)
    {
        dbContext.JournalEntries.Update(entry);
        await dbContext.SaveChangesAsync(ct);
    }
}
