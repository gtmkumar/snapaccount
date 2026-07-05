using ItrService.Domain.Entities;

namespace ItrService.Application.Interfaces;

/// <summary>
/// Repository contract for <see cref="TaxComputation"/> aggregate root.
/// Defined in Application layer per Clean Architecture dependency rule.
/// Implementation in ItrService.Infrastructure/Persistence/Repositories/.
/// </summary>
public interface ITaxComputationRepository
{
    /// <summary>Returns a tax computation by its identifier, or null when not found.</summary>
    Task<TaxComputation?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Returns all computations for a user and assessment year.</summary>
    Task<IReadOnlyList<TaxComputation>> GetByUserAndYearAsync(
        Guid userId, string assessmentYear, CancellationToken ct = default);

    /// <summary>Persists a new tax computation and returns the saved entity.</summary>
    Task<TaxComputation> AddAsync(TaxComputation computation, CancellationToken ct = default);
}
