using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.TaxSlabs.Queries.GetTaxSlabs;

/// <summary>Returns tax slab configuration for a given AY and regime.</summary>
public record GetTaxSlabsQuery(string AssessmentYear, string Regime) : IQuery<TaxSlabsDto>;

public record TaxSlabsDto(
    Guid VersionId, string AssessmentYear, string Regime,
    string SlabsJson, decimal StandardDeduction,
    decimal Rebate87AIncomeLimit, decimal Rebate87AMaxAmount,
    decimal CessRatePct);

public sealed class GetTaxSlabsQueryValidator : AbstractValidator<GetTaxSlabsQuery>
{
    public GetTaxSlabsQueryValidator()
    {
        RuleFor(x => x.AssessmentYear).NotEmpty().Matches(@"^AY\d{4}-\d{2}$");
        RuleFor(x => x.Regime).Must(r => r is "OLD" or "NEW").WithMessage("Regime must be OLD or NEW.");
    }
}

public sealed class GetTaxSlabsQueryHandler(IItrDbContext dbContext) : IQueryHandler<GetTaxSlabsQuery, TaxSlabsDto>
{
    public async Task<Result<TaxSlabsDto>> Handle(GetTaxSlabsQuery request, CancellationToken cancellationToken)
    {
        var v = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.TaxSlabVersions
                    .Where(t => t.AssessmentYear == request.AssessmentYear && t.Regime == request.Regime)
                    .OrderByDescending(t => t.EffectiveFrom),
                cancellationToken);

        if (v is null)
            return Error.NotFound("TaxSlab.NotFound", $"No slab version found for AY={request.AssessmentYear} regime={request.Regime}.");

        return new TaxSlabsDto(v.Id, v.AssessmentYear, v.Regime, v.SlabsJson,
            v.StandardDeduction, v.Rebate87AIncomeLimit, v.Rebate87AMaxAmount, v.CessRatePct);
    }
}
