using AccountingService.Domain.Entities;

namespace AccountingService.Application.Interfaces;

/// <summary>
/// Repository contract for <see cref="LedgerEntry"/> aggregate.
/// Write-side only — query handlers access IAccountingDbContext directly.
/// </summary>
public interface ILedgerEntryRepository
{
    /// <summary>Returns a ledger entry by ID, or null.</summary>
    Task<LedgerEntry?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Returns the first ledger entry matching a dedupe hash, or null.
    /// Used for Pub/Sub idempotency check (P6-HANDOFF-03).
    /// </summary>
    Task<LedgerEntry?> GetByDedupeHashAsync(string dedupeHash, CancellationToken ct = default);

    /// <summary>Persists a new ledger entry.</summary>
    Task<LedgerEntry> AddAsync(LedgerEntry entry, CancellationToken ct = default);

    /// <summary>Persists changes to an existing ledger entry.</summary>
    Task UpdateAsync(LedgerEntry entry, CancellationToken ct = default);
}
