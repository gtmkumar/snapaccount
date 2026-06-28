using ItrService.Application.Common.Interfaces;
using ItrService.Application.TaxSlabs.Queries.GetTaxSlabs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ItrService.Application.Services;

/// <summary>
/// Pure tax computation engine — no DB writes, no side effects.
/// Reads tax slabs and deduction limits from the database (P6-HANDOFF-18: NEVER hardcode).
/// Pinned results (tax_slab_version_id + computation_jsonb) are persisted by the calling handler.
/// </summary>
public interface ITaxComputationEngine
{
    /// <summary>Computes income tax for the given inputs.</summary>
    Task<Result<TaxComputationResult>> ComputeAsync(TaxComputationInput input, CancellationToken ct = default);
}

/// <summary>
/// Input to the tax computation engine.
/// DG-ITR-09: <see cref="NewRegimeDeductionClaims"/> carries per-section claim amounts
/// for deduction sections whose catalog entry has Regime = "NEW" or "BOTH"
/// (e.g. 80CCD(2) employer NPS under new regime).
/// When null the engine will still load the catalog itself for the new regime.
/// </summary>
public sealed record TaxComputationInput(
    string AssessmentYear,
    string Regime,
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
    /// Optional per-section new-regime deduction claims, keyed by section code (e.g. "80CCD(2)").
    /// Populated from the ComputeTaxCommand. When a section code appears in the deduction catalog
    /// with Regime = "NEW" or "BOTH" and IsAvailable = true, the engine caps the claim
    /// at the catalog MaxLimit and adds it to new-regime deductions.
    /// DG-ITR-09.
    /// </summary>
    IReadOnlyDictionary<string, decimal>? NewRegimeDeductionClaims = null);

/// <summary>
/// Immutable result from the tax engine.
/// SEC-020: computation_hash is SHA-256 of canonical inputs (audit/replay invariant).
/// </summary>
public sealed record TaxComputationResult(
    Guid TaxSlabVersionId,
    string AssessmentYear,
    string Regime,
    decimal GrossTotalIncome,
    decimal StandardDeduction,
    decimal TotalDeductions,
    decimal TaxableIncome,
    string SlabWiseBreakdownJson,
    decimal GrossTax,
    decimal Rebate87A,
    decimal TaxAfterRebate,
    decimal Surcharge,
    decimal Cess4Pct,
    decimal TotalTaxPayable,
    decimal AdvanceTaxPaid,
    decimal TdsPaid,
    decimal PayableOrRefund,
    string ComputationHash,
    string ComputationJsonb);

/// <summary>
/// Implementation of <see cref="ITaxComputationEngine"/>.
/// Reads <c>itr.tax_slab_versions</c> keyed by (ay, regime, act_version).
/// GAP-102: for AY2026-27 onward prefers IT_ACT_2025 rows; falls back to IT_ACT_1961 with warning.
/// </summary>
public sealed class TaxComputationEngine(
    IItrDbContext dbContext,
    ILogger<TaxComputationEngine> logger) : ITaxComputationEngine
{
    /// <inheritdoc />
    public async Task<Result<TaxComputationResult>> ComputeAsync(TaxComputationInput input, CancellationToken ct = default)
    {
        // Load tax slab version with act_version resolution (GAP-102)
        var targetActVersion = GetTaxSlabsQueryHandler.ResolveTargetActVersion(input.AssessmentYear);
        var slabVersion = await FindSlabVersion(input.AssessmentYear, input.Regime, targetActVersion, ct);

        // Fall-back: 2025-Act requested but not yet seeded → fall back to 1961 with warning
        if (slabVersion is null && targetActVersion == "IT_ACT_2025")
        {
            logger.LogWarning(
                "TaxComputationEngine: No IT_ACT_2025 slab for AY={AY} regime={Regime}. " +
                "Falling back to IT_ACT_1961.",
                input.AssessmentYear, input.Regime);
            slabVersion = await FindSlabVersion(input.AssessmentYear, input.Regime, "IT_ACT_1961", ct);
        }

        if (slabVersion is null)
            return Error.NotFound("TaxSlab.NotFound",
                $"No tax slab version found for AY={input.AssessmentYear} regime={input.Regime}");

        // Gross Total Income
        var gti = input.SalaryIncome + input.HousePropertyIncome + input.BusinessIncome
            + input.CapitalGains + input.OtherIncome;

        // Standard deduction (from slab version, NOT hardcoded)
        var standardDeduction = Math.Min(slabVersion.StandardDeduction, input.SalaryIncome);

        // Chapter VI-A deductions
        // OLD regime: full Chapter VI-A basket (80C, 80D, 80E, etc.) from request inputs.
        // NEW regime: DG-ITR-09 — config-driven; load deduction sections with Regime = "NEW" or "BOTH"
        //   from the catalog and apply any claims supplied in NewRegimeDeductionClaims, capped at MaxLimit.
        //   This makes the allowed set configuration-driven (versioned per AY/act_version), not hardcoded.
        //   Legally allowed example: 80CCD(2) employer NPS u/s 115BAC.
        decimal deductions = 0m;
        if (input.Regime == "OLD")
        {
            deductions = input.Section80C + input.Section80D + input.Section80E + input.OtherDeductions;
        }
        else
        {
            // DG-ITR-09: query catalog for sections available in new regime for this AY + act_version.
            // targetActVersion is already resolved above (line 91); reuse it directly.
            deductions = await CalculateNewRegimeDeductionsAsync(
                input, targetActVersion, ct);
        }

        var totalDeductions = standardDeduction + deductions;
        var taxableIncome = Math.Max(0m, gti - totalDeductions);

        // Slab-wise tax calculation from JSON config
        var slabs = JsonSerializer.Deserialize<List<TaxSlab>>(slabVersion.SlabsJson)
            ?? throw new InvalidOperationException($"Could not deserialize slabs for {input.AssessmentYear}/{input.Regime}");

        var (grossTax, slabBreakdown) = CalculateSlabTax(taxableIncome, slabs);

        // Rebate u/s 87A
        var rebate87A = taxableIncome <= slabVersion.Rebate87AIncomeLimit
            ? Math.Min(grossTax, slabVersion.Rebate87AMaxAmount)
            : 0m;

        var taxAfterRebate = Math.Max(0m, grossTax - rebate87A);

        // Surcharge
        var surcharge = CalculateSurcharge(taxableIncome, taxAfterRebate, slabVersion.SurchargeJson);

        // Cess (4% health and education cess — rate from config, not hardcoded)
        var cessBase = taxAfterRebate + surcharge;
        var cess = Math.Round(cessBase * (slabVersion.CessRatePct / 100m), 2);

        var totalTax = taxAfterRebate + surcharge + cess;
        var payableOrRefund = totalTax - input.AdvanceTaxPaid - input.TdsPaid;

        // Build computation JSON (used for pinned replay)
        var computationData = new
        {
            input.AssessmentYear,
            input.Regime,
            TaxSlabVersionId = slabVersion.Id,
            GrossTotalIncome = gti,
            StandardDeduction = standardDeduction,
            TotalDeductions = totalDeductions,
            TaxableIncome = taxableIncome,
            GrossTax = grossTax,
            Rebate87A = rebate87A,
            TaxAfterRebate = taxAfterRebate,
            Surcharge = surcharge,
            Cess4Pct = cess,
            TotalTaxPayable = totalTax,
            AdvanceTaxPaid = input.AdvanceTaxPaid,
            TdsPaid = input.TdsPaid,
            PayableOrRefund = payableOrRefund
        };

        var computationJsonb = JsonSerializer.Serialize(computationData,
            new JsonSerializerOptions { WriteIndented = false });
        var computationHash = ComputeHash(computationJsonb);

        return new TaxComputationResult(
            TaxSlabVersionId: slabVersion.Id,
            AssessmentYear: input.AssessmentYear,
            Regime: input.Regime,
            GrossTotalIncome: gti,
            StandardDeduction: standardDeduction,
            TotalDeductions: totalDeductions,
            TaxableIncome: taxableIncome,
            SlabWiseBreakdownJson: JsonSerializer.Serialize(slabBreakdown),
            GrossTax: grossTax,
            Rebate87A: rebate87A,
            TaxAfterRebate: taxAfterRebate,
            Surcharge: surcharge,
            Cess4Pct: cess,
            TotalTaxPayable: totalTax,
            AdvanceTaxPaid: input.AdvanceTaxPaid,
            TdsPaid: input.TdsPaid,
            PayableOrRefund: payableOrRefund,
            ComputationHash: computationHash,
            ComputationJsonb: computationJsonb);
    }

    /// <summary>
    /// DG-ITR-09: Calculates new-regime eligible deductions by reading the deduction catalog
    /// (itr.deduction_sections) for sections with Regime = "NEW" or "BOTH" and IsAvailable = true.
    /// Each claim is capped at the catalog MaxLimit (when not null). The set of eligible sections
    /// is fully configuration-driven and versioned by AY and ActVersion — never hardcoded.
    ///
    /// Current known new-regime sections (illustrative; authoritative source is the DB seed):
    ///   - 80CCD(2): Employer's contribution to NPS — allowed u/s 115BAC, up to 10% of salary.
    ///   - 80JJAA:   Additional employment deduction (specified employees, manufacturing).
    /// </summary>
    private async Task<decimal> CalculateNewRegimeDeductionsAsync(
        TaxComputationInput input, string actVersion, CancellationToken ct)
    {
        // Load new-regime-eligible sections from the catalog.
        // Regime = "NEW" means ONLY new-regime; "BOTH" means applicable in both.
        var eligibleSections = await dbContext.DeductionSections
            .Where(d => d.AssessmentYear == input.AssessmentYear
                     && d.IsAvailable
                     && d.ActVersion == actVersion
                     && (d.Regime == "NEW" || d.Regime == "BOTH"))
            .ToListAsync(ct);

        // Fall-back: if the target act version returned nothing, try IT_ACT_1961.
        if (eligibleSections.Count == 0 && actVersion == "IT_ACT_2025")
        {
            eligibleSections = await dbContext.DeductionSections
                .Where(d => d.AssessmentYear == input.AssessmentYear
                         && d.IsAvailable
                         && d.ActVersion == "IT_ACT_1961"
                         && (d.Regime == "NEW" || d.Regime == "BOTH"))
                .ToListAsync(ct);
        }

        if (eligibleSections.Count == 0 || input.NewRegimeDeductionClaims is null)
        {
            // No catalog entries or no claims provided → zero new-regime deductions (correct for 2024-25+).
            return 0m;
        }

        decimal total = 0m;
        foreach (var section in eligibleSections)
        {
            if (!input.NewRegimeDeductionClaims.TryGetValue(section.SectionCode, out var claimed))
                continue;

            if (claimed <= 0m) continue;

            // Cap claim at the catalog MaxLimit (when set).
            var allowed = section.MaxLimit.HasValue
                ? Math.Min(claimed, section.MaxLimit.Value)
                : claimed;

            total += allowed;
            logger.LogDebug(
                "TaxComputationEngine NEW regime: section {Section} claimed={Claimed} allowed={Allowed} (MaxLimit={Max})",
                section.SectionCode, claimed, allowed, section.MaxLimit);
        }

        return total;
    }

    private async Task<ItrService.Domain.Entities.TaxSlabVersion?> FindSlabVersion(
        string ay, string regime, string actVersion, CancellationToken ct)
        => await dbContext.TaxSlabVersions
            .Where(v => v.AssessmentYear == ay
                     && v.Regime == regime
                     && v.ActVersion == actVersion
                     && (v.EffectiveUntil == null || v.EffectiveUntil >= DateOnly.FromDateTime(DateTime.UtcNow)))
            .OrderByDescending(v => v.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

    private static (decimal GrossTax, List<SlabBreakdownItem> Breakdown) CalculateSlabTax(
        decimal taxableIncome, List<TaxSlab> slabs)
    {
        decimal totalTax = 0m;
        var breakdown = new List<SlabBreakdownItem>();

        foreach (var slab in slabs.OrderBy(s => s.FromIncome))
        {
            if (taxableIncome <= slab.FromIncome) break;

            var upper = slab.ToIncome ?? decimal.MaxValue;
            var incomeInSlab = Math.Min(taxableIncome, upper) - slab.FromIncome;
            if (incomeInSlab <= 0) continue;

            var tax = Math.Round(incomeInSlab * slab.RatePct / 100m, 2);
            totalTax += tax;
            breakdown.Add(new SlabBreakdownItem(slab.FromIncome, upper == decimal.MaxValue ? null : upper, slab.RatePct, incomeInSlab, tax));
        }

        return (totalTax, breakdown);
    }

    private static decimal CalculateSurcharge(decimal taxableIncome, decimal taxAfterRebate, string? surchargeJson)
    {
        if (string.IsNullOrEmpty(surchargeJson)) return 0m;

        try
        {
            var tiers = JsonSerializer.Deserialize<List<SurchargeTier>>(surchargeJson);
            if (tiers is null) return 0m;

            var applicable = tiers
                .Where(t => taxableIncome > t.IncomeThreshold)
                .OrderByDescending(t => t.IncomeThreshold)
                .FirstOrDefault();

            return applicable is null
                ? 0m
                : Math.Round(taxAfterRebate * applicable.RatePct / 100m, 2);
        }
        catch { return 0m; }
    }

    private static string ComputeHash(string canonicalJson)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonicalJson));
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    // Internal deserialization DTOs
    private sealed record TaxSlab(
        [property: System.Text.Json.Serialization.JsonPropertyName("from_income")] decimal FromIncome,
        [property: System.Text.Json.Serialization.JsonPropertyName("to_income")] decimal? ToIncome,
        [property: System.Text.Json.Serialization.JsonPropertyName("rate_pct")] decimal RatePct);

    private sealed record SurchargeTier(
        [property: System.Text.Json.Serialization.JsonPropertyName("income_threshold")] decimal IncomeThreshold,
        [property: System.Text.Json.Serialization.JsonPropertyName("rate_pct")] decimal RatePct);

    private sealed record SlabBreakdownItem(
        decimal FromIncome, decimal? ToIncome, decimal RatePct, decimal IncomeInSlab, decimal Tax);
}
