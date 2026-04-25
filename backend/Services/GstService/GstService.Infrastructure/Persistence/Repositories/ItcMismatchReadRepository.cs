using GstService.Application.Interfaces;
using GstService.Application.ItcReconciliation.Queries.GetItcMismatches;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GstService.Infrastructure.Persistence.Repositories;

/// <summary>
/// Read-side EF Core projection repository for ITC mismatches.
/// Uses <see cref="GstDbContext"/> directly and projects to DTOs —
/// the JT CQRS pattern for queries that do not need aggregate loading.
/// </summary>
public sealed class ItcMismatchReadRepository(GstDbContext dbContext) : IItcMismatchReadRepository
{
    /// <inheritdoc />
    public async Task<IReadOnlyList<ItcMismatchDto>> GetByOrganizationAsync(
        Guid organizationId,
        string? status,
        CancellationToken ct = default)
    {
        var query = dbContext.ItcMismatches
            .Where(m => m.OrganizationId == organizationId);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(m => m.Status == status);

        return await query
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new ItcMismatchDto(
                m.Id,
                m.MismatchType,
                m.ClaimedAmount,
                m.AvailableAmount,
                m.ClaimedAmount - m.AvailableAmount, // DifferenceAmount — computed, not stored
                m.Status))
            .ToListAsync(ct);
    }
}
