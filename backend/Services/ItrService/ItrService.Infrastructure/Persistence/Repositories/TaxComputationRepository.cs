using ItrService.Application.Interfaces;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ItrService.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="ITaxComputationRepository"/>.
/// </summary>
public sealed class TaxComputationRepository(ItrServiceDbContext dbContext) : ITaxComputationRepository
{
    /// <inheritdoc />
    public Task<TaxComputation?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.TaxComputations.FirstOrDefaultAsync(t => t.Id == id, ct);

    /// <inheritdoc />
    public async Task<IReadOnlyList<TaxComputation>> GetByUserAndYearAsync(
        Guid userId,
        string assessmentYear,
        CancellationToken ct = default)
        => await dbContext.TaxComputations
            .Where(t => t.UserId == userId && t.AssessmentYear == assessmentYear)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

    /// <inheritdoc />
    public async Task<TaxComputation> AddAsync(TaxComputation computation, CancellationToken ct = default)
    {
        dbContext.TaxComputations.Add(computation);
        await dbContext.SaveChangesAsync(ct);
        return computation;
    }
}
