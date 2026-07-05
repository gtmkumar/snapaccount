using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.TaxRates.Queries.ListTaxRates;

/// <summary>
/// GAP-022: Returns all GST tax rates, optionally filtered to currently active ones.
/// Sorted by RatePct ASC then ValidFrom DESC (newest effective date first per group).
/// </summary>
public record ListTaxRatesQuery(bool ActiveOnly = false) : IQuery<IReadOnlyList<TaxRateDto>>;

/// <summary>GST tax rate row DTO.</summary>
public record TaxRateDto(
    Guid Id,
    string RateName,
    decimal RatePct,
    decimal CgstPct,
    decimal SgstPct,
    decimal IgstPct,
    decimal CessPct,
    DateOnly ValidFrom,
    DateOnly? ValidTo,
    bool IsActive,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>Handles <see cref="ListTaxRatesQuery"/>.</summary>
public sealed class ListTaxRatesQueryHandler(IGstDbContext db)
    : IQueryHandler<ListTaxRatesQuery, IReadOnlyList<TaxRateDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<TaxRateDto>>> Handle(
        ListTaxRatesQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.GstTaxRates.Where(r => r.DeletedAt == null);

        if (request.ActiveOnly)
            query = query.Where(r => r.IsActive && r.ValidTo == null);

        var rates = await query
            .OrderBy(r => r.RatePct)
            .ThenByDescending(r => r.ValidFrom)
            .Select(r => new TaxRateDto(
                r.Id,
                r.RateName,
                r.RatePct,
                r.CgstPct,
                r.SgstPct,
                r.IgstPct,
                r.CessPct,
                r.ValidFrom,
                r.ValidTo,
                r.IsActive,
                r.Notes,
                r.CreatedAt,
                r.UpdatedAt))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<TaxRateDto>>.Success(rates);
    }
}
