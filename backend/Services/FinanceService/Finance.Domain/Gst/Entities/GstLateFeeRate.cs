using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Config-driven late-fee rate row. One entry per (return_type, is_nil_return) validity range.
/// DG-GST-04: per-day penalty amounts are stored here — never hardcoded.
/// Rates sourced from CGST Act Section 47 and periodic government notifications.
/// </summary>
public sealed class GstLateFeeRate : BaseEntity
{
    /// <summary>GST return type this rate applies to (e.g. 'GSTR-3B', 'GSTR-1').</summary>
    public string ReturnType { get; private set; } = string.Empty;

    /// <summary>True if this rate applies to nil returns; false for non-nil returns.</summary>
    public bool IsNilReturn { get; private set; }

    /// <summary>Per-day late-fee in INR (decimal — never float/double).</summary>
    public decimal PerDayAmount { get; private set; }

    /// <summary>Maximum cap in INR; null means no statutory cap applies.</summary>
    public decimal? MaxCapAmount { get; private set; }

    /// <summary>Date from which this rate is effective (inclusive).</summary>
    public DateOnly ValidFrom { get; private set; }

    /// <summary>Date until which this rate is effective (exclusive); null means currently active.</summary>
    public DateOnly? ValidTo { get; private set; }

    /// <summary>Optional note for audit / reference.</summary>
    public string? Notes { get; private set; }

    // Private for EF Core materialisation
    private GstLateFeeRate() { }

    /// <summary>
    /// Returns true if this rate is effective on <paramref name="date"/>.
    /// </summary>
    public bool IsEffectiveOn(DateOnly date)
        => date >= ValidFrom && (ValidTo is null || date < ValidTo);
}
