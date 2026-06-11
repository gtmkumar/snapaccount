using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.TaxRates.Queries.GetEffectiveTaxRate;

/// <summary>
/// GAP-022: Returns the effective tax rate for a given rate name and effective date.
/// An "effective" rate is one where <c>valid_from &lt;= asOfDate</c>
/// and (<c>valid_to IS NULL</c> OR <c>valid_to &gt;= asOfDate</c>) and <c>is_active = true</c>.
/// Returns NotFound if no rate is configured for the requested name on that date.
/// </summary>
public record GetEffectiveTaxRateQuery(string RateName, DateOnly AsOfDate)
    : IQuery<EffectiveTaxRateDto>;

/// <summary>Effective rate DTO.</summary>
public record EffectiveTaxRateDto(
    Guid Id,
    string RateName,
    decimal RatePct,
    decimal CgstPct,
    decimal SgstPct,
    decimal IgstPct,
    decimal CessPct,
    DateOnly ValidFrom,
    DateOnly? ValidTo);

/// <summary>Handles <see cref="GetEffectiveTaxRateQuery"/>.</summary>
public sealed class GetEffectiveTaxRateQueryHandler(IGstDbContext db)
    : IQueryHandler<GetEffectiveTaxRateQuery, EffectiveTaxRateDto>
{
    /// <inheritdoc />
    public async Task<Result<EffectiveTaxRateDto>> Handle(
        GetEffectiveTaxRateQuery request,
        CancellationToken cancellationToken)
    {
        var rate = await db.GstTaxRates
            .Where(r =>
                r.RateName == request.RateName
                && r.IsActive
                && r.DeletedAt == null
                && r.ValidFrom <= request.AsOfDate
                && (r.ValidTo == null || r.ValidTo >= request.AsOfDate))
            .OrderByDescending(r => r.ValidFrom)
            .Select(r => new EffectiveTaxRateDto(
                r.Id,
                r.RateName,
                r.RatePct,
                r.CgstPct,
                r.SgstPct,
                r.IgstPct,
                r.CessPct,
                r.ValidFrom,
                r.ValidTo))
            .FirstOrDefaultAsync(cancellationToken);

        if (rate is null)
            return Result<EffectiveTaxRateDto>.Failure(
                Error.NotFound("TaxRate.NotFound",
                    $"No active GST rate '{request.RateName}' effective on {request.AsOfDate:O}."));

        return Result<EffectiveTaxRateDto>.Success(rate);
    }
}
