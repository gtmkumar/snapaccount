using GstService.Application.ItcReconciliation.Queries.GetItcMismatches;

namespace GstService.Application.Interfaces;

/// <summary>
/// Read-side repository for ITC mismatch projections.
/// Returns flat DTOs directly — no aggregate loading required for this query.
/// Implementation in GstService.Infrastructure uses EF Core projections against GstDbContext.
/// </summary>
public interface IItcMismatchReadRepository
{
    /// <summary>
    /// Returns ITC mismatches for an organisation, optionally filtered by status.
    /// </summary>
    Task<IReadOnlyList<ItcMismatchDto>> GetByOrganizationAsync(
        Guid organizationId,
        string? status,
        CancellationToken ct = default);
}
