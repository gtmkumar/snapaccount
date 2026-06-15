using AccountingService.Domain.Entities;

namespace AccountingService.Application.Interfaces;

/// <summary>
/// Repository contract for the <see cref="JournalEntry"/> aggregate root.
/// Command handlers depend on this abstraction; implementation lives in
/// AccountingService.Infrastructure/Persistence/Repositories/.
/// Query handlers may access AccountingDbContext directly for read projections
/// (JT CQRS pattern).
/// </summary>
public interface IJournalEntryRepository
{
    /// <summary>Returns a journal entry with its lines, or null when not found.</summary>
    Task<JournalEntry?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Persists a new journal entry and returns the saved entity.</summary>
    Task<JournalEntry> AddAsync(JournalEntry entry, CancellationToken ct = default);

    /// <summary>Persists changes to an existing journal entry.</summary>
    Task UpdateAsync(JournalEntry entry, CancellationToken ct = default);
}
