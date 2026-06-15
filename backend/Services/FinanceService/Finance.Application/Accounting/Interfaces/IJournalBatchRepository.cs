using AccountingService.Domain.Entities;

namespace AccountingService.Application.Interfaces;

/// <summary>Repository contract for <see cref="JournalBatch"/> aggregate.</summary>
public interface IJournalBatchRepository
{
    /// <summary>Returns a journal batch with entries, or null.</summary>
    Task<JournalBatch?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Persists a new journal batch.</summary>
    Task<JournalBatch> AddAsync(JournalBatch batch, CancellationToken ct = default);

    /// <summary>Persists changes to an existing batch.</summary>
    Task UpdateAsync(JournalBatch batch, CancellationToken ct = default);
}
