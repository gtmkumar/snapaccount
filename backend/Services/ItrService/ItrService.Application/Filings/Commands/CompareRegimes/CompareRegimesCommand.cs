using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Services;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.CompareRegimes;

/// <summary>
/// Runs the tax engine twice (OLD + NEW regime) and returns a side-by-side comparison.
/// Recommends the regime that results in lower tax or higher refund.
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
    decimal TdsPaid) : ICommand<CompareRegimesResponse>;

public record CompareRegimesResponse(
    RegimeComputationDto OldRegime,
    RegimeComputationDto NewRegime,
    string RecommendedRegime,
    decimal SavingsWithRecommended);

public record RegimeComputationDto(
    string Regime,
    decimal GrossTotalIncome,
    decimal TaxableIncome,
    decimal TotalTaxPayable,
    decimal PayableOrRefund);

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

        var baseInput = new TaxComputationInput(
            filing.AssessmentYear, "OLD", // regime overridden per call
            request.SalaryIncome, request.HousePropertyIncome, request.BusinessIncome,
            request.CapitalGains, request.OtherIncome,
            request.Section80C, request.Section80D, request.Section80E, request.OtherDeductions,
            request.AdvanceTaxPaid, request.TdsPaid);

        var oldResult = await engine.ComputeAsync(baseInput, cancellationToken);
        if (oldResult.IsFailure) return oldResult.Error;

        var newResult = await engine.ComputeAsync(baseInput with { Regime = "NEW" }, cancellationToken);
        if (newResult.IsFailure) return newResult.Error;

        var oldDto = new RegimeComputationDto("OLD", oldResult.Value.GrossTotalIncome,
            oldResult.Value.TaxableIncome, oldResult.Value.TotalTaxPayable, oldResult.Value.PayableOrRefund);
        var newDto = new RegimeComputationDto("NEW", newResult.Value.GrossTotalIncome,
            newResult.Value.TaxableIncome, newResult.Value.TotalTaxPayable, newResult.Value.PayableOrRefund);

        // Recommend regime with lower payable (or higher refund = more negative payableOrRefund)
        var oldPayable = oldResult.Value.PayableOrRefund;
        var newPayable = newResult.Value.PayableOrRefund;
        var recommended = newPayable <= oldPayable ? "NEW" : "OLD";
        var savings = Math.Abs(oldPayable - newPayable);

        return new CompareRegimesResponse(oldDto, newDto, recommended, savings);
    }
}
