using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IFiscalYearCloseRepository"/>.
/// Operates on existing <c>accounting.financial_year_close</c> table. P6-HANDOFF-01.
/// </summary>
public sealed class FiscalYearCloseRepository(AccountingDbContext dbContext) : IFiscalYearCloseRepository
{
    /// <inheritdoc />
    public Task<FiscalYearClose?> GetByOrgAndYearAsync(Guid orgId, int fyYear, CancellationToken ct = default)
        => dbContext.FiscalYearCloses.FirstOrDefaultAsync(f => f.OrgId == orgId && f.FyYear == fyYear, ct);

    /// <inheritdoc />
    public async Task<FiscalYearClose> AddAsync(FiscalYearClose close, CancellationToken ct = default)
    {
        dbContext.FiscalYearCloses.Add(close);
        await dbContext.SaveChangesAsync(ct);
        return close;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(FiscalYearClose close, CancellationToken ct = default)
    {
        dbContext.FiscalYearCloses.Update(close);
        await dbContext.SaveChangesAsync(ct);
    }
}
