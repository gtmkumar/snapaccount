using AccountingService.Domain.Entities;

namespace AccountingService.Application.Interfaces;

/// <summary>
/// Repository contract for <see cref="FiscalYearClose"/>.
/// Maps to existing <c>accounting.financial_year_close</c> table (P6-HANDOFF-01).
/// </summary>
public interface IFiscalYearCloseRepository
{
    /// <summary>Returns the FY close record for an org/year, or null if none exists yet.</summary>
    Task<FiscalYearClose?> GetByOrgAndYearAsync(Guid orgId, int fyYear, CancellationToken ct = default);

    /// <summary>Persists a new FY close record.</summary>
    Task<FiscalYearClose> AddAsync(FiscalYearClose close, CancellationToken ct = default);

    /// <summary>Persists changes to an existing FY close record.</summary>
    Task UpdateAsync(FiscalYearClose close, CancellationToken ct = default);
}
