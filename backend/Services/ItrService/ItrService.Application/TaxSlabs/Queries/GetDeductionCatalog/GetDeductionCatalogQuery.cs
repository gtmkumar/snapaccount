using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.TaxSlabs.Queries.GetDeductionCatalog;

/// <summary>Returns the deduction section catalog for a given AY and regime.</summary>
public record GetDeductionCatalogQuery(string AssessmentYear, string Regime) : IQuery<DeductionCatalogDto>;

public record DeductionCatalogDto(IReadOnlyList<DeductionSectionDto> Sections);

public record DeductionSectionDto(
    Guid Id, string SectionCode, string Name, string? Description,
    decimal? MaxLimit, bool AvailableInNewRegime, bool AvailableInOldRegime);

public sealed class GetDeductionCatalogQueryValidator : AbstractValidator<GetDeductionCatalogQuery>
{
    public GetDeductionCatalogQueryValidator()
    {
        RuleFor(x => x.AssessmentYear).NotEmpty().Matches(@"^AY\d{4}-\d{2}$");
        RuleFor(x => x.Regime).Must(r => r is "OLD" or "NEW").WithMessage("Regime must be OLD or NEW.");
    }
}

public sealed class GetDeductionCatalogQueryHandler(IItrDbContext dbContext)
    : IQueryHandler<GetDeductionCatalogQuery, DeductionCatalogDto>
{
    public async Task<Result<DeductionCatalogDto>> Handle(GetDeductionCatalogQuery request, CancellationToken cancellationToken)
    {
        var q = dbContext.DeductionSections.Where(d => d.AssessmentYear == request.AssessmentYear && d.IsActive);
        if (request.Regime == "NEW") q = q.Where(d => d.AvailableInNewRegime);
        else q = q.Where(d => d.AvailableInOldRegime);

        var items = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .ToListAsync(q.OrderBy(d => d.SectionCode), cancellationToken);

        var dtos = items.Select(d => new DeductionSectionDto(
            d.Id, d.SectionCode, d.Name, d.Description, d.MaxLimit,
            d.AvailableInNewRegime, d.AvailableInOldRegime)).ToList();

        return new DeductionCatalogDto(dtos);
    }
}
