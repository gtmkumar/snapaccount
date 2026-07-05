using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Filings.Commands.ComputeTax;
using ItrService.Application.Services;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace ItrService.Application.Filings.Commands.CompareRegimes;

/// <summary>
/// Runs the tax engine twice (OLD + NEW regime) and returns a side-by-side comparison.
/// Recommends the regime that results in lower tax or higher refund.
/// DG-ITR-01: CompareRegimesResponse now aligns with admin RegimeComparisonSchema — old/new
/// are full ComputationResult objects (same shape as ComputeTaxResponse), plus recommendedRegime/taxSaving.
/// DG-ITR-09: NewRegimeDeductionClaims passed to the engine's new-regime branch so the comparison
/// correctly reflects new-regime-eligible deductions (e.g. 80CCD(2) employer NPS).
/// Phase 6D.
/// </summary>
[RequiresPermission("itr.filings.compute")]
public record CompareRegimesCommand(
    Guid FilingId,
    decimal SalaryIncome,
    decimal HousePropertyIncome,
    decimal BusinessIncome,
    decimal CapitalGains,
    decimal OtherIncome,
    decimal Section80C,
    decimal Section80D,
    decimal Section80E,
    decimal OtherDeductions,
    decimal AdvanceTaxPaid,
    decimal TdsPaid,
    IReadOnlyDictionary<string, decimal>? NewRegimeDeductionClaims = null) : ICommand<CompareRegimesResponse>;

/// <summary>
/// DG-ITR-01: aligned with admin RegimeComparisonSchema {old, new, recommendedRegime, taxSaving}.
/// Old/New are full ComputeTaxResponse objects (same shape as ComputationResultSchema).
/// </summary>
public record CompareRegimesResponse(
    ComputeTaxResponse Old,
    ComputeTaxResponse New,
    string RecommendedRegime,
    decimal TaxSaving);

public sealed class CompareRegimesCommandValidator : AbstractValidator<CompareRegimesCommand>
{
    public CompareRegimesCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.SalaryIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.AdvanceTaxPaid).GreaterThanOrEqualTo(0);
        RuleFor(x => x.TdsPaid).GreaterThanOrEqualTo(0);
    }
}

public sealed class CompareRegimesCommandHandler(
    IItrDbContext dbContext,
    ITaxComputationEngine engine) : ICommandHandler<CompareRegimesCommand, CompareRegimesResponse>
{
    public async Task<Result<CompareRegimesResponse>> Handle(CompareRegimesCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null),
                cancellationToken);

        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // DG-ITR-09: pass NewRegimeDeductionClaims to the NEW regime branch for accurate comparison.
        var baseInput = new TaxComputationInput(
            filing.AssessmentYear, "OLD", // regime overridden per call
            request.SalaryIncome, request.HousePropertyIncome, request.BusinessIncome,
            request.CapitalGains, request.OtherIncome,
            request.Section80C, request.Section80D, request.Section80E, request.OtherDeductions,
            request.AdvanceTaxPaid, request.TdsPaid,
            NewRegimeDeductionClaims: request.NewRegimeDeductionClaims);

        var oldResult = await engine.ComputeAsync(baseInput, cancellationToken);
        if (oldResult.IsFailure) return oldResult.Error;

        var newResult = await engine.ComputeAsync(baseInput with { Regime = "NEW" }, cancellationToken);
        if (newResult.IsFailure) return newResult.Error;

        // DG-ITR-01: project both results into full ComputeTaxResponse (same shape as ComputationResultSchema)
        // so the admin RegimeComparisonSchema {old, new, recommendedRegime, taxSaving} parse succeeds.
        var oldDto = ToComputeTaxResponse(request.FilingId, oldResult.Value);
        var newDto = ToComputeTaxResponse(request.FilingId, newResult.Value);

        // Recommend regime with lower payable (or higher refund = more negative payableOrRefund)
        var oldPayable = oldResult.Value.PayableOrRefund;
        var newPayable = newResult.Value.PayableOrRefund;
        var recommended = newPayable <= oldPayable ? "NEW" : "OLD";
        var saving = Math.Abs(oldPayable - newPayable);

        return new CompareRegimesResponse(oldDto, newDto, recommended, saving);
    }

    private static ComputeTaxResponse ToComputeTaxResponse(Guid filingId, TaxComputationResult r)
    {
        IReadOnlyList<SlabBreakdownDto>? slabBreakdown = null;
        if (!string.IsNullOrWhiteSpace(r.SlabWiseBreakdownJson))
        {
            try
            {
                var items = JsonSerializer.Deserialize<List<EngineSlabItem>>(r.SlabWiseBreakdownJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                slabBreakdown = items?.ConvertAll(i => new SlabBreakdownDto(i.FromIncome, i.ToIncome, i.RatePct, i.Tax));
            }
            catch { /* non-critical — slab breakdown is optional in schema */ }
        }

        return new ComputeTaxResponse(
            FilingId: filingId,
            GrossTotalIncome: r.GrossTotalIncome,
            Deductions: r.TotalDeductions,
            TaxableIncome: r.TaxableIncome,
            TaxOnIncome: r.GrossTax,
            Surcharge: r.Surcharge,
            CessAmount: r.Cess4Pct,
            Rebate87A: r.Rebate87A,
            GrossTaxLiability: r.TotalTaxPayable,
            TdsPaid: r.TdsPaid,
            AdvanceTaxPaid: r.AdvanceTaxPaid,
            TotalCredits: r.TdsPaid + r.AdvanceTaxPaid,
            PayableOrRefund: r.PayableOrRefund,
            ComputationHash: r.ComputationHash,
            Regime: r.Regime,
            AssessmentYear: r.AssessmentYear,
            SlabBreakdown: slabBreakdown);
    }

    // Matches the shape TaxComputationEngine.SlabBreakdownItem serialises (PascalCase record, case-insensitive deserialise).
    private sealed record EngineSlabItem(
        decimal FromIncome, decimal? ToIncome, decimal RatePct, decimal IncomeInSlab, decimal Tax);
}
