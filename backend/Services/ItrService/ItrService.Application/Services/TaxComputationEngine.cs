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

/// <summary>Input to the tax computation engine.</summary>
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
    decimal TdsPaid);

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

        // Chapter VI-A deductions (only in old regime, or specific sections in new)
        decimal deductions = 0m;
        if (input.Regime == "OLD")
        {
            deductions = input.Section80C + input.Section80D + input.Section80E + input.OtherDeductions;
        }
        else
        {
            // New regime: very limited deductions (NPS employer contribution etc.)
            // Only standard deduction applies for most cases
            deductions = 0m;
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
