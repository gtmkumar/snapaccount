using FluentValidation;
using ItrService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.TaxSlabs.Queries.GetDeductionCatalog;

/// <summary>Returns the deduction section catalog for a given AY and regime.</summary>
public record GetDeductionCatalogQuery(string AssessmentYear, string Regime) : IQuery<DeductionCatalogDto>;

/// <summary>
/// Deduction catalog response.
/// <see cref="ActVersion"/> indicates which Income-tax Act governs these deduction entries.
/// </summary>
public record DeductionCatalogDto(
    IReadOnlyList<DeductionSectionDto> Sections,
    /// <summary>Governing Act: IT_ACT_1961 | IT_ACT_2025.</summary>
    string ActVersion);

/// <summary>Single deduction section entry.</summary>
public record DeductionSectionDto(
    Guid Id,
    string SectionCode,
    /// <summary>Regime applicability: "OLD" | "NEW" | "BOTH".</summary>
    string Regime,
    string? Description,
    decimal? MaxLimit,
    /// <summary>Derived from Regime: true when Regime is NEW or BOTH.</summary>
    bool AvailableInNewRegime,
    /// <summary>Derived from Regime: true when Regime is OLD or BOTH.</summary>
    bool AvailableInOldRegime,
    /// <summary>Governing Act for this section: IT_ACT_1961 | IT_ACT_2025.</summary>
    string ActVersion);

public sealed class GetDeductionCatalogQueryValidator : AbstractValidator<GetDeductionCatalogQuery>
{
    public GetDeductionCatalogQueryValidator()
    {
        RuleFor(x => x.AssessmentYear).NotEmpty().Matches(@"^AY\d{4}-\d{2}$");
        RuleFor(x => x.Regime).Must(r => r is "OLD" or "NEW").WithMessage("Regime must be OLD or NEW.");
    }
}

public sealed class GetDeductionCatalogQueryHandler(
    IItrDbContext dbContext,
    ILogger<GetDeductionCatalogQueryHandler> logger)
    : IQueryHandler<GetDeductionCatalogQuery, DeductionCatalogDto>
{
    /// <summary>
    /// IT Act 2025 resolution rule (GAP-102):
    ///   For AY2026-27 onward, prefer IT_ACT_2025 deduction rows if seeded;
    ///   fall back to IT_ACT_1961 with a warning if not seeded.
    /// </summary>
    public async Task<Result<DeductionCatalogDto>> Handle(
        GetDeductionCatalogQuery request, CancellationToken cancellationToken)
    {
        // Determine target act version using the same rule as GetTaxSlabsQuery
        var targetActVersion = ResolveTargetActVersion(request.AssessmentYear);

        var items = await QueryDeductions(request, targetActVersion, cancellationToken);

        // Fall-back if 2025-Act rows not yet seeded
        if (items.Count == 0 && targetActVersion == "IT_ACT_2025")
        {
            logger.LogWarning(
                "No IT_ACT_2025 deduction sections found for AY={AY}. " +
                "Falling back to IT_ACT_1961. Seed 2025-Act content to resolve this warning.",
                request.AssessmentYear);
            targetActVersion = "IT_ACT_1961";
            items = await QueryDeductions(request, targetActVersion, cancellationToken);
        }

        var dtos = items.Select(d => new DeductionSectionDto(
            d.Id,
            d.SectionCode,
            d.Regime,
            d.Description,
            d.MaxLimit,
            AvailableInNewRegime: d.Regime is "NEW" or "BOTH",
            AvailableInOldRegime: d.Regime is "OLD" or "BOTH",
            d.ActVersion)).ToList();

        return new DeductionCatalogDto(dtos, targetActVersion);
    }

    private async Task<List<ItrService.Domain.Entities.DeductionSection>> QueryDeductions(
        GetDeductionCatalogQuery request, string actVersion, CancellationToken ct)
    {
        // Live schema uses a single "regime" string column: OLD | NEW | BOTH.
        // "BOTH" rows are available regardless of regime; OLD/NEW are regime-specific.
        var q = dbContext.DeductionSections
            .Where(d => d.AssessmentYear == request.AssessmentYear
                     && d.IsAvailable
                     && d.ActVersion == actVersion
                     && (d.Regime == request.Regime || d.Regime == "BOTH"));

        return await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .ToListAsync(q.OrderBy(d => d.SectionCode), ct);
    }

    /// <summary>
    /// Same resolution rule as <see cref="GetTaxSlabsQueryHandler.ResolveTargetActVersion"/>.
    /// AY2026-27 onward → prefer IT_ACT_2025.
    /// </summary>
    public static string ResolveTargetActVersion(string assessmentYear)
        => string.Compare(assessmentYear, "AY2026-27", StringComparison.Ordinal) >= 0
            ? "IT_ACT_2025"
            : "IT_ACT_1961";
}
