using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Services;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.ComputeTax;

/// <summary>
/// Runs the tax computation engine and pins the result on the filing.
/// P6-HANDOFF-18: pins tax_slab_version_id + computation_jsonb on every call.
/// Phase 6D.
/// </summary>
[RequiresPermission("itr.filings.compute")]
public record ComputeTaxCommand(
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
    decimal TdsPaid) : ICommand<ComputeTaxResponse>;

public record ComputeTaxResponse(
    Guid FilingId,
    decimal GrossTotalIncome,
    decimal TaxableIncome,
    decimal TotalTaxPayable,
    decimal PayableOrRefund,
    string ComputationHash,
    string Regime,
    string AssessmentYear);

public sealed class ComputeTaxCommandValidator : AbstractValidator<ComputeTaxCommand>
{
    public ComputeTaxCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.SalaryIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.HousePropertyIncome).GreaterThanOrEqualTo(-1_50_00_000m); // allow loss
        RuleFor(x => x.BusinessIncome).GreaterThanOrEqualTo(-1_00_00_00_000m);
        RuleFor(x => x.CapitalGains).GreaterThanOrEqualTo(0);
        RuleFor(x => x.OtherIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Section80C).InclusiveBetween(0, 1_50_000m);
        RuleFor(x => x.Section80D).InclusiveBetween(0, 1_00_000m);
        RuleFor(x => x.AdvanceTaxPaid).GreaterThanOrEqualTo(0);
        RuleFor(x => x.TdsPaid).GreaterThanOrEqualTo(0);
    }
}

public sealed class ComputeTaxCommandHandler(
    IItrDbContext dbContext,
    ITaxComputationEngine engine,
    ICurrentUser currentUser) : ICommandHandler<ComputeTaxCommand, ComputeTaxResponse>
{
    public async Task<Result<ComputeTaxResponse>> Handle(ComputeTaxCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null),
                cancellationToken);

        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-039: post-fetch assessee org check — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        if (filing.Status is "FILED" or "E_VERIFIED")
            return Error.Conflict("Filing.Immutable", "Cannot recompute a filed or e-verified filing.");

        // Update income heads on filing
        filing.UpdateIncomeHeads(
            request.SalaryIncome, request.HousePropertyIncome,
            request.BusinessIncome, request.CapitalGains, request.OtherIncome);
        filing.UpdateDeductions(request.Section80C + request.Section80D + request.Section80E + request.OtherDeductions);

        // Run pure computation engine
        var input = new TaxComputationInput(
            filing.AssessmentYear, filing.Regime,
            request.SalaryIncome, request.HousePropertyIncome, request.BusinessIncome,
            request.CapitalGains, request.OtherIncome,
            request.Section80C, request.Section80D, request.Section80E, request.OtherDeductions,
            request.AdvanceTaxPaid, request.TdsPaid);

        var computeResult = await engine.ComputeAsync(input, cancellationToken);
        if (computeResult.IsFailure) return computeResult.Error;

        var result = computeResult.Value;

        // Pin computation on filing (P6-HANDOFF-18)
        filing.PinComputation(result.TaxSlabVersionId, result.ComputationJsonb, result.ComputationHash);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new ComputeTaxResponse(
            filing.Id, result.GrossTotalIncome, result.TaxableIncome,
            result.TotalTaxPayable, result.PayableOrRefund,
            result.ComputationHash, result.Regime, result.AssessmentYear);
    }
}
