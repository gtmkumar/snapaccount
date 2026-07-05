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

    // ── IT Act 2025 dimension (migration 072 / GAP-102) ──────────────────────

    /// <summary>
    /// Governing Income-tax Act for this slab version.
    /// Allowed values: <c>IT_ACT_1961</c> (default) | <c>IT_ACT_2025</c>.
    /// The 2025 Act applies from tax year 2026-27 onward, once its config rows are seeded.
    /// </summary>
    public string ActVersion { get; private set; } = "IT_ACT_1961";

    /// <summary>
    /// IT Act 2025 "tax year" terminology (e.g. "2026-27"), kept alongside
    /// the existing <see cref="AssessmentYear"/> column for backward compatibility.
    /// </summary>
    public string? TaxYear { get; private set; }

    private TaxSlabVersion() { }
}
