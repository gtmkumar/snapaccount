using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Config-driven annual interest rate on unpaid GST tax (CGST Act Section 50).
/// DG-GST-04: interest rate is stored here — never hardcoded.
/// Currently 18% p.a. (simple interest) since GST inception in July 2017.
/// </summary>
public sealed class GstInterestRate : BaseEntity
{
    /// <summary>Annual interest rate in percent (e.g. 18.00 for 18% p.a.).</summary>
    public decimal RatePct { get; private set; }

    /// <summary>Date from which this rate is effective (inclusive).</summary>
    public DateOnly ValidFrom { get; private set; }

    /// <summary>Date until which this rate is effective (exclusive); null means currently active.</summary>
    public DateOnly? ValidTo { get; private set; }

    /// <summary>Optional note for audit / reference.</summary>
    public string? Notes { get; private set; }

    // Private for EF Core materialisation
    private GstInterestRate() { }

    /// <summary>Returns true if this rate is effective on <paramref name="date"/>.</summary>
    public bool IsEffectiveOn(DateOnly date)
        => date >= ValidFrom && (ValidTo is null || date < ValidTo);
}
