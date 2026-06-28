using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// HSN (Harmonised System of Nomenclature) or SAC (Services Accounting Code) master entry.
/// <para>
/// GST rate resolution: when <see cref="TaxRateName"/> is set, callers must resolve the
/// rate temporally via <c>gst.gst_tax_rate</c> (valid_from/valid_to) rather than using
/// the legacy flat <see cref="GstRatePct"/> column. This satisfies the Indian compliance
/// requirement that GST rates are configuration-driven and FY-versioned (DG-GST-06).
/// </para>
/// </summary>
public class HsnSacCode : BaseAuditableEntity
{
    public string Code { get; private set; } = string.Empty;
    public string CodeType { get; private set; } = string.Empty; // HSN or SAC
    public string Description { get; private set; } = string.Empty;

    /// <summary>
    /// Legacy flat GST rate (from CBIC schedule at time of import).
    /// Use <see cref="TaxRateName"/> + temporal gst_tax_rate lookup instead when available.
    /// </summary>
    public decimal? GstRatePct { get; private set; }

    /// <summary>
    /// DG-GST-06: Links this HSN/SAC code to a named entry in <c>gst.gst_tax_rate</c>
    /// (e.g. "GST 18%"). When set, the temporal table is the authoritative rate source;
    /// <see cref="GstRatePct"/> is only the fallback for unmapped codes.
    /// </summary>
    public string? TaxRateName { get; private set; }

    public bool IsActive { get; private set; } = true;

    private HsnSacCode() { }

    /// <summary>
    /// Creates a new HSN/SAC code entry.
    /// </summary>
    /// <param name="code">The HSN or SAC code string.</param>
    /// <param name="codeType">Must be "HSN" or "SAC".</param>
    /// <param name="description">Human-readable description from CBIC schedule.</param>
    /// <param name="gstRatePct">Legacy flat rate (optional); prefer <paramref name="taxRateName"/>.</param>
    /// <param name="taxRateName">
    /// Named rate in gst_tax_rate (e.g. "GST 18%"). When provided, temporal lookup is used
    /// for rate resolution (DG-GST-06).
    /// </param>
    public static HsnSacCode Create(
        string code,
        string codeType,
        string description,
        decimal? gstRatePct = null,
        string? taxRateName = null)
        => new()
        {
            Code = code,
            CodeType = codeType,
            Description = description,
            GstRatePct = gstRatePct,
            TaxRateName = taxRateName
        };

    /// <summary>
    /// DG-GST-06: Sets the linked rate name, enabling temporal GST rate resolution.
    /// </summary>
    public void SetTaxRateName(string rateName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rateName);
        TaxRateName = rateName;
    }
}
