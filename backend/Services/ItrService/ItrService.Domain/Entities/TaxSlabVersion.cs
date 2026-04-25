using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Read-only seed entity: a versioned tax slab configuration.
/// Keyed by (AssessmentYear, Regime) per P6-HANDOFF-18.
/// AY format: "AY2025-26". Regime: "OLD" | "NEW".
/// NEVER hardcode slab values — always read from this table.
/// </summary>
public class TaxSlabVersion : BaseEntity
{
    /// <summary>Assessment year in format "AY2025-26".</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>Tax regime: OLD | NEW.</summary>
    public string Regime { get; private set; } = string.Empty;

    /// <summary>
    /// JSON array of slab brackets:
    /// [{"from_income": 0, "to_income": 300000, "rate_pct": 0}, ...]
    /// Null upper bound (to_income = null) means "above threshold".
    /// </summary>
    public string SlabsJson { get; private set; } = string.Empty;

    /// <summary>Standard deduction amount (INR) applicable for this AY/regime.</summary>
    public decimal StandardDeduction { get; private set; }

    /// <summary>Rebate u/s 87A: income limit (INR) below which full rebate applies.</summary>
    public decimal Rebate87AIncomeLimit { get; private set; }

    /// <summary>Rebate u/s 87A: maximum rebate amount (INR).</summary>
    public decimal Rebate87AMaxAmount { get; private set; }

    /// <summary>Surcharge applicable (jsonb array of {income_threshold, rate_pct}).</summary>
    public string? SurchargeJson { get; private set; }

    /// <summary>Health and Education Cess percentage (always 4%).</summary>
    public decimal CessRatePct { get; private set; } = 4m;

    /// <summary>Version effective from date.</summary>
    public DateOnly EffectiveFrom { get; private set; }

    /// <summary>Version effective until date (null = current).</summary>
    public DateOnly? EffectiveUntil { get; private set; }

    private TaxSlabVersion() { }
}
