using FluentValidation;
using ItrService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.TaxSlabs.Queries.GetTaxSlabs;

/// <summary>Returns tax slab configuration for a given AY and regime.</summary>
public record GetTaxSlabsQuery(string AssessmentYear, string Regime) : IQuery<TaxSlabsDto>;

/// <summary>
/// Tax slab configuration DTO.
/// <see cref="ActVersion"/> indicates which Income-tax Act governs these slabs
/// — <c>IT_ACT_1961</c> (default) or <c>IT_ACT_2025</c> (from tax year 2026-27 onward,
/// once 2025-Act config rows are seeded).
/// </summary>
public record TaxSlabsDto(
    Guid VersionId,
    string AssessmentYear,
    string Regime,
    string SlabsJson,
    decimal StandardDeduction,
    decimal Rebate87AIncomeLimit,
    decimal Rebate87AMaxAmount,
    decimal CessRatePct,
    /// <summary>Governing Act: IT_ACT_1961 | IT_ACT_2025.</summary>
    string ActVersion,
    /// <summary>IT Act 2025 tax year (e.g. "2026-27"). Null for pre-2026-27 periods.</summary>
    string? TaxYear);

public sealed class GetTaxSlabsQueryValidator : AbstractValidator<GetTaxSlabsQuery>
{
    public GetTaxSlabsQueryValidator()
    {
        RuleFor(x => x.AssessmentYear).NotEmpty().Matches(@"^AY\d{4}-\d{2}$");
        RuleFor(x => x.Regime).Must(r => r is "OLD" or "NEW").WithMessage("Regime must be OLD or NEW.");
    }
}

public sealed class GetTaxSlabsQueryHandler(
    IItrDbContext dbContext,
    ILogger<GetTaxSlabsQueryHandler> logger)
    : IQueryHandler<GetTaxSlabsQuery, TaxSlabsDto>
{
    /// <summary>
    /// IT Act 2025 resolution rule (GAP-102):
    ///   For tax year 2026-27 onward, prefer IT_ACT_2025 rows if they exist;
    ///   fall back to IT_ACT_1961 with a warning log if no 2025-Act rows are seeded.
    ///   For earlier periods, always use IT_ACT_1961.
    ///
    /// "Tax year 2026-27 onward" is detected by the AssessmentYear string: AY2026-27 or later
    /// maps to tax year 2025-26 under the old Act convention, but the new Act uses AY2026-27
    /// as the first year it governs. Threshold: ay >= "AY2026-27".
    /// </summary>
    public async Task<Result<TaxSlabsDto>> Handle(GetTaxSlabsQuery request, CancellationToken cancellationToken)
    {
        var targetActVersion = ResolveTargetActVersion(request.AssessmentYear);

        var v = await TryFindSlabVersion(request.AssessmentYear, request.Regime, targetActVersion, cancellationToken);

        // Fall-back: if targeted 2025-Act but no rows are seeded, fall back to 1961 with warning.
        if (v is null && targetActVersion == "IT_ACT_2025")
        {
            logger.LogWarning(
                "No IT_ACT_2025 slab version found for AY={AY} regime={Regime}. " +
                "Falling back to IT_ACT_1961. Seed 2025-Act config rows to resolve this warning.",
                request.AssessmentYear, request.Regime);
            v = await TryFindSlabVersion(request.AssessmentYear, request.Regime, "IT_ACT_1961", cancellationToken);
        }

        if (v is null)
            return Error.NotFound("TaxSlab.NotFound",
                $"No slab version found for AY={request.AssessmentYear} regime={request.Regime}.");

        return new TaxSlabsDto(
            v.Id, v.AssessmentYear, v.Regime, v.SlabsJson,
            v.StandardDeduction, v.Rebate87AIncomeLimit, v.Rebate87AMaxAmount, v.CessRatePct,
            v.ActVersion, v.TaxYear);
    }

    private async Task<ItrService.Domain.Entities.TaxSlabVersion?> TryFindSlabVersion(
        string ay, string regime, string actVersion, CancellationToken ct)
        => await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.TaxSlabVersions
                    .Where(t => t.AssessmentYear == ay
                             && t.Regime == regime
                             && t.ActVersion == actVersion)
                    .OrderByDescending(t => t.EffectiveFrom),
                ct);

    /// <summary>
    /// Determines the preferred <c>act_version</c> for a given assessment year.
    /// Rule: AY2026-27 onward → try IT_ACT_2025 first; earlier → IT_ACT_1961.
    /// The first year the new Act governs is AY2026-27 (tax year 2026-27 = FY 2026-27).
    /// </summary>
    public static string ResolveTargetActVersion(string assessmentYear)
    {
        // AY format: "AY2026-27" — compare lexicographically after "AY" prefix.
        // "AY2026-27" >= "AY2026-27" → true → prefer 2025-Act
        return string.Compare(assessmentYear, "AY2026-27", StringComparison.Ordinal) >= 0
            ? "IT_ACT_2025"
            : "IT_ACT_1961";
    }
}
