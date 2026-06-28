using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Services;
using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ItrService.Application.Filings.Commands.ComputeTax;

/// <summary>
/// Runs the tax computation engine and pins the result on the filing.
/// P6-HANDOFF-18: pins tax_slab_version_id + computation_jsonb on every call.
/// DG-ITR-09: NewRegimeDeductionClaims carries per-section claim amounts for
/// new-regime-eligible deduction sections (e.g. "80CCD(2)" employer NPS).
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
    decimal TdsPaid,
    /// <summary>
    /// DG-ITR-09: optional per-section new-regime deduction claims (section code → claimed INR amount).
    /// Keys must match <c>itr.deduction_sections.section</c> values (e.g. "80CCD(2)", "80JJAA").
    /// The engine caps each claim at the catalog's MaxLimit and only applies sections with
    /// Regime = "NEW" or "BOTH" and IsAvailable = true for the filing's AY.
    /// Null means no new-regime claims (zero new-regime deductions — correct for most salaried assessees).
    /// </summary>
    IReadOnlyDictionary<string, decimal>? NewRegimeDeductionClaims = null) : ICommand<ComputeTaxResponse>;

/// <summary>
/// Slab-wise tax breakdown item — JSON property names match the admin ComputationResultSchema.slabBreakdown shape.
/// DG-ITR-01: from/to/rate/taxOnSlab (not the engine's internal PascalCase names).
/// </summary>
public record SlabBreakdownDto(
    [property: JsonPropertyName("from")] decimal From,
    [property: JsonPropertyName("to")] decimal? To,
    [property: JsonPropertyName("rate")] decimal Rate,
    [property: JsonPropertyName("taxOnSlab")] decimal TaxOnSlab);

/// <summary>
/// Full computation result projected to match the admin ComputationResultSchema exactly.
/// DG-ITR-01: all fields required by the admin zod schema are now present.
/// Field mapping from TaxComputationResult:
///   deductions         = TotalDeductions (standard + chapter VI-A)
///   taxOnIncome        = GrossTax (slab tax before rebate)
///   cessAmount         = Cess4Pct
///   grossTaxLiability  = TotalTaxPayable (= TaxAfterRebate + Surcharge + Cess)
///   totalCredits       = TdsPaid + AdvanceTaxPaid
/// </summary>
public record ComputeTaxResponse(
    Guid FilingId,
    decimal GrossTotalIncome,
    decimal Deductions,
    decimal TaxableIncome,
    decimal TaxOnIncome,
    decimal Surcharge,
    decimal CessAmount,
    decimal Rebate87A,
    decimal GrossTaxLiability,
    decimal TdsPaid,
    decimal AdvanceTaxPaid,
    decimal TotalCredits,
    decimal PayableOrRefund,
    string ComputationHash,
    string Regime,
    string AssessmentYear,
    IReadOnlyList<SlabBreakdownDto>? SlabBreakdown = null);

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

        // Run pure computation engine (DG-ITR-09: pass new-regime deduction claims)
        var input = new TaxComputationInput(
            filing.AssessmentYear, filing.Regime,
            request.SalaryIncome, request.HousePropertyIncome, request.BusinessIncome,
            request.CapitalGains, request.OtherIncome,
            request.Section80C, request.Section80D, request.Section80E, request.OtherDeductions,
            request.AdvanceTaxPaid, request.TdsPaid,
            NewRegimeDeductionClaims: request.NewRegimeDeductionClaims);

        var computeResult = await engine.ComputeAsync(input, cancellationToken);
        if (computeResult.IsFailure) return computeResult.Error;

        var result = computeResult.Value;

        // Pin computation on filing (P6-HANDOFF-18)
        filing.PinComputation(result.TaxSlabVersionId, result.ComputationJsonb, result.ComputationHash);

        // DG-ITR-07: append a computation-version history row.
        // Build input JSON matching ComputationInputSchema (camelCase, admin contract).
        var inputJson = JsonSerializer.Serialize(new
        {
            salaryIncome = request.SalaryIncome,
            housePropertyIncome = request.HousePropertyIncome,
            businessIncome = request.BusinessIncome,
            capitalGains = request.CapitalGains,
            otherIncome = request.OtherIncome,
            section80C = request.Section80C,
            section80D = request.Section80D,
            section80E = request.Section80E,
            otherDeductions = request.OtherDeductions,
            advanceTaxPaid = request.AdvanceTaxPaid,
            tdsPaid = request.TdsPaid
        });

        // Build result JSON matching ComputationResultSchema (camelCase, admin contract).
        var slabBreakdown = DeserializeSlabBreakdown(result.SlabWiseBreakdownJson);
        var resultJson = JsonSerializer.Serialize(new
        {
            filingId = filing.Id,
            grossTotalIncome = result.GrossTotalIncome,
            deductions = result.TotalDeductions,
            taxableIncome = result.TaxableIncome,
            taxOnIncome = result.GrossTax,
            surcharge = result.Surcharge,
            cessAmount = result.Cess4Pct,
            rebate87A = result.Rebate87A,
            grossTaxLiability = result.TotalTaxPayable,
            tdsPaid = result.TdsPaid,
            advanceTaxPaid = result.AdvanceTaxPaid,
            totalCredits = result.TdsPaid + result.AdvanceTaxPaid,
            payableOrRefund = result.PayableOrRefund,
            computationHash = result.ComputationHash,
            regime = result.Regime,
            assessmentYear = result.AssessmentYear,
            slabBreakdown = slabBreakdown?.Select(s => new { from = s.From, to = s.To, rate = s.Rate, taxOnSlab = s.TaxOnSlab })
        });

        // Determine next version number for this filing (count existing rows + 1).
        var nextVersion = await dbContext.ComputationVersions
            .Where(v => v.FilingId == filing.Id)
            .CountAsync(cancellationToken) + 1;

        var actorName = currentUser.Email
            ?? currentUser.FirebaseUid
            ?? "System";

        var versionEntry = ComputationVersionEntry.Create(
            filingId: filing.Id,
            version: nextVersion,
            actorName: actorName,
            inputJson: inputJson,
            resultJson: resultJson,
            label: $"Draft {nextVersion}");

        dbContext.ComputationVersions.Add(versionEntry);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new ComputeTaxResponse(
            FilingId: filing.Id,
            GrossTotalIncome: result.GrossTotalIncome,
            Deductions: result.TotalDeductions,
            TaxableIncome: result.TaxableIncome,
            TaxOnIncome: result.GrossTax,
            Surcharge: result.Surcharge,
            CessAmount: result.Cess4Pct,
            Rebate87A: result.Rebate87A,
            GrossTaxLiability: result.TotalTaxPayable,
            TdsPaid: result.TdsPaid,
            AdvanceTaxPaid: result.AdvanceTaxPaid,
            TotalCredits: result.TdsPaid + result.AdvanceTaxPaid,
            PayableOrRefund: result.PayableOrRefund,
            ComputationHash: result.ComputationHash,
            Regime: result.Regime,
            AssessmentYear: result.AssessmentYear,
            SlabBreakdown: slabBreakdown);
    }

    /// <summary>
    /// Deserialises the engine's internal slab breakdown JSON into the admin-compatible DTO shape.
    /// Engine serialises SlabBreakdownItem with PascalCase; we project to from/to/rate/taxOnSlab.
    /// </summary>
    private static IReadOnlyList<SlabBreakdownDto>? DeserializeSlabBreakdown(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            var items = JsonSerializer.Deserialize<List<EngineSlabItem>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (items is null) return null;
            return items.ConvertAll(i => new SlabBreakdownDto(i.FromIncome, i.ToIncome, i.RatePct, i.Tax));
        }
        catch { return null; }
    }

    // Internal deserialization type matching what TaxComputationEngine.SlabBreakdownItem serialises.
    private sealed record EngineSlabItem(
        decimal FromIncome, decimal? ToIncome, decimal RatePct, decimal IncomeInSlab, decimal Tax);
}
