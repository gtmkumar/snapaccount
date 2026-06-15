using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GstService.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IGstReturnRepository"/>.
/// Command handlers use this repository exclusively for write operations.
/// Read-side query handlers (GetGstReturn, GetItcMismatches) access
/// <see cref="GstDbContext"/> directly for lean projection queries
/// (JT CQRS pattern — documented in each query handler).
/// </summary>
public sealed class GstReturnRepository(GstDbContext dbContext) : IGstReturnRepository
{
    /// <inheritdoc />
    public Task<GstReturn?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.GstReturns
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    /// <inheritdoc />
    public Task<bool> ExistsAsync(
        Guid orgId,
        string returnType,
        string fy,
        int? periodMonth,
        CancellationToken ct)
        => dbContext.GstReturns.AnyAsync(r =>
            r.OrganizationId == orgId &&
            r.ReturnType == returnType &&
            r.FinancialYear == fy &&
            r.PeriodMonth == periodMonth, ct);

    /// <inheritdoc />
    public async Task<GstReturn> AddAsync(GstReturn gstReturn, CancellationToken ct)
    {
        dbContext.GstReturns.Add(gstReturn);
        await dbContext.SaveChangesAsync(ct);
        return gstReturn;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(GstReturn gstReturn, CancellationToken ct)
    {
        dbContext.GstReturns.Update(gstReturn);
        await dbContext.SaveChangesAsync(ct);
    }
}
