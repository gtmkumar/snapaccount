using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Temporal table — GST tax rates change with government policy.
/// A rate is active when valid_to IS NULL or NOW() is between valid_from and valid_to.
/// </summary>
public class GstTaxRate : BaseAuditableEntity
{
    public string RateName { get; private set; } = string.Empty; // e.g. 'GST 18%'
    public decimal RatePct { get; private set; } // e.g. 18.00
    public decimal CgstPct { get; private set; } // rate_pct / 2 intra-state
    public decimal SgstPct { get; private set; } // rate_pct / 2 intra-state
    public decimal IgstPct { get; private set; } // rate_pct inter-state
    public decimal CessPct { get; private set; }
    public DateOnly ValidFrom { get; private set; }
    public DateOnly? ValidTo { get; private set; } // NULL = currently active
    public bool IsActive { get; private set; } = true;
    public string? Notes { get; private set; }

    private GstTaxRate() { }

    public static GstTaxRate Create(string rateName, decimal ratePct, DateOnly validFrom, string? notes = null)
    {
        var cgstSgst = Math.Round(ratePct / 2, 2);
        return new GstTaxRate
        {
            RateName = rateName,
            RatePct = ratePct,
            CgstPct = cgstSgst,
            SgstPct = cgstSgst,
            IgstPct = ratePct,
            ValidFrom = validFrom,
            Notes = notes
        };
    }

    public bool IsCurrentlyActive => IsActive && ValidTo == null;

    /// <summary>
    /// GAP-022: Terminates this rate by setting <see cref="ValidTo"/>.
    /// Called automatically when a newer rate with the same name is created.
    /// </summary>
    public void Terminate(DateOnly validTo)
    {
        ValidTo = validTo;
    }

    /// <summary>
    /// GAP-022: Deactivates this rate (admin soft-disable).
    /// The rate remains in history but is excluded from active-rate lookups.
    /// </summary>
    public void Deactivate() => IsActive = false;
}
