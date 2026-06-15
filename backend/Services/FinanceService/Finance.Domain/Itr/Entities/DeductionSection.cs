using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Read-only seed entity: Chapter VI-A deduction catalog.
/// Examples: 80C (INR 1.5L limit), 80D (mediclaim), 80E (education loan), etc.
/// NEVER hardcode deduction limits — always read from this table.
///
/// Live column alignment (itr.deduction_sections, migration 073):
///   section       → SectionCode
///   ay            → AssessmentYear
///   regime        → Regime (string: OLD|NEW|BOTH)
///   description   → Description
///   max_amount    → MaxLimit
///   is_available  → IsAvailable
///   act_version   → ActVersion
///   tax_year      → TaxYear
///
/// Note: AvailableInNewRegime/AvailableInOldRegime do NOT exist as live columns —
/// the live schema stores a single "regime" string column instead. Use Regime + IsAvailable.
/// </summary>
public class DeductionSection : BaseEntity
{
    /// <summary>Section code, e.g. "80C", "80D", "80E". Live column: section.</summary>
    public string SectionCode { get; private set; } = string.Empty;

    /// <summary>
    /// Regime applicability: "OLD" | "NEW" | "BOTH".
    /// Live column: regime (text, NOT NULL, check constraint).
    /// </summary>
    public string Regime { get; private set; } = "BOTH";

    /// <summary>Description of what qualifies. Live column: description.</summary>
    public string? Description { get; private set; }

    /// <summary>
    /// Maximum deduction limit per assessment year (INR). Null = no limit.
    /// Live column: max_amount (numeric(20,2)).
    /// </summary>
    public decimal? MaxLimit { get; private set; }

    /// <summary>Assessment year this entry is effective from. Live column: ay.</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>
    /// Whether the section is available for this AY/regime combination.
    /// Live column: is_available (boolean, NOT NULL, default true).
    /// </summary>
    public bool IsAvailable { get; private set; } = true;

    // ── IT Act 2025 dimension (migration 072 / GAP-102) ──────────────────────

    /// <summary>
    /// Governing Income-tax Act for this deduction section entry.
    /// Allowed values: <c>IT_ACT_1961</c> (default) | <c>IT_ACT_2025</c>.
    /// Live column: act_version (varchar(20), NOT NULL, default IT_ACT_1961).
    /// </summary>
    public string ActVersion { get; private set; } = "IT_ACT_1961";

    /// <summary>
    /// IT Act 2025 "tax year" terminology (e.g. "2026-27"), kept alongside
    /// the existing <see cref="AssessmentYear"/> for backward compatibility.
    /// Live column: tax_year (varchar(10), nullable).
    /// </summary>
    public string? TaxYear { get; private set; }

    private DeductionSection() { }
}
