using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Read-only seed entity: Chapter VI-A deduction catalog.
/// Examples: 80C (INR 1.5L limit), 80D (mediclaim), 80E (education loan), etc.
/// NEVER hardcode deduction limits — always read from this table.
/// </summary>
public class DeductionSection : BaseEntity
{
    /// <summary>Section code, e.g. "80C", "80D", "80E".</summary>
    public string SectionCode { get; private set; } = string.Empty;

    /// <summary>Human-readable name.</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>Description of what qualifies.</summary>
    public string? Description { get; private set; }

    /// <summary>Maximum deduction limit per assessment year (INR). Null = no limit.</summary>
    public decimal? MaxLimit { get; private set; }

    /// <summary>Whether this deduction is available under the new regime.</summary>
    public bool AvailableInNewRegime { get; private set; }

    /// <summary>Whether this deduction is available under the old regime.</summary>
    public bool AvailableInOldRegime { get; private set; } = true;

    /// <summary>Assessment year this entry is effective from.</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>Whether the section is currently active.</summary>
    public bool IsActive { get; private set; } = true;

    private DeductionSection() { }
}
