using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IJournalBatchRepository"/>.</summary>
public sealed class JournalBatchRepository(AccountingDbContext dbContext) : IJournalBatchRepository
{
    /// <inheritdoc />
    public Task<JournalBatch?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.JournalBatches.FirstOrDefaultAsync(b => b.Id == id && b.DeletedAt == null, ct);

    /// <inheritdoc />
    public async Task<JournalBatch> AddAsync(JournalBatch batch, CancellationToken ct = default)
    {
        dbContext.JournalBatches.Add(batch);
        await dbContext.SaveChangesAsync(ct);
        return batch;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(JournalBatch batch, CancellationToken ct = default)
    {
        dbContext.JournalBatches.Update(batch);
        await dbContext.SaveChangesAsync(ct);
    }
}
