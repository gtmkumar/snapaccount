using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Per-organisation GST profile — stores the annual turnover (in Crore) used to evaluate
/// the e-invoice mandate and other turnover-based compliance thresholds.
/// DG-GST-05: turnover gate for e-invoice generation (mandatory if > 5 Crore).
/// The threshold itself is config-driven (GstService:EInvoiceThresholdCrore), not hardcoded here.
/// </summary>
public sealed class GstOrgProfile : BaseAuditableEntity
{
    /// <summary>Organization this profile belongs to.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>
    /// Annual turnover in Indian Rupees Crore (e.g. 7.5 = Rs 7.5 Crore).
    /// Null means the org has not declared turnover — system defaults to not enforcing e-invoice.
    /// </summary>
    public decimal? AnnualTurnoverCr { get; private set; }

    /// <summary>
    /// When true, e-invoice generation is always permitted regardless of the turnover check.
    /// Allows admins to enable e-invoicing for orgs that voluntarily opt in below the threshold.
    /// </summary>
    public bool EInvoiceEnabled { get; private set; }

    /// <summary>Financial year for which the turnover figure applies (e.g. '2024-25').</summary>
    public string? EffectiveFromFy { get; private set; }

    // Private for EF Core materialisation
    private GstOrgProfile() { }

    /// <summary>Creates a new GST org profile with the given turnover.</summary>
    public static GstOrgProfile Create(
        Guid organizationId,
        decimal? annualTurnoverCr,
        bool eInvoiceEnabled,
        string? effectiveFromFy)
        => new()
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            AnnualTurnoverCr = annualTurnoverCr,
            EInvoiceEnabled = eInvoiceEnabled,
            EffectiveFromFy = effectiveFromFy,
        };

    /// <summary>Updates the annual turnover and e-invoice override flag.</summary>
    public void Update(decimal? annualTurnoverCr, bool eInvoiceEnabled, string? effectiveFromFy)
    {
        AnnualTurnoverCr = annualTurnoverCr;
        EInvoiceEnabled = eInvoiceEnabled;
        EffectiveFromFy = effectiveFromFy;
    }

    /// <summary>
    /// Returns true when this org is required to generate e-invoices given a threshold in Crore.
    /// If <see cref="EInvoiceEnabled"/> is set, returns true unconditionally.
    /// If <see cref="AnnualTurnoverCr"/> is null, returns false (threshold not determinable).
    /// </summary>
    public bool IsEInvoiceMandatory(decimal thresholdCrore)
        => EInvoiceEnabled || (AnnualTurnoverCr.HasValue && AnnualTurnoverCr.Value > thresholdCrore);
}
