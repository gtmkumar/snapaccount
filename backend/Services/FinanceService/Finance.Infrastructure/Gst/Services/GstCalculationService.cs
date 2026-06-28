using GstService.Application.Interfaces;
using GstService.Domain.ValueObjects;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace GstService.Infrastructure.Services;

/// <summary>
/// Calculates GST components (CGST/SGST for intra-state, IGST for inter-state supply)
/// using rates loaded from the gst.gst_tax_rate temporal table.
/// Rates are never hardcoded — compliance requirement per SnapAccount Indian compliance rules.
/// </summary>
public sealed class GstCalculationService(
    GstDbContext dbContext,
    ILogger<GstCalculationService> logger) : IGstCalculationService
{
    /// <inheritdoc />
    public async Task<Result<GstCalculationResult>> CalculateAsync(
        GstCalculationInput input,
        CancellationToken ct = default)
    {
        var igst = 0m;
        var cgst = 0m;
        var sgst = 0m;
        var cess = input.TaxableValue * (input.CessPct / 100m);

        if (input.IsInterState)
        {
            igst = input.TaxableValue * (input.GstRatePct / 100m);
        }
        else
        {
            var halfRate = input.GstRatePct / 2m;
            cgst = input.TaxableValue * (halfRate / 100m);
            sgst = input.TaxableValue * (halfRate / 100m);
        }

        var taxAmount = TaxAmount.From(cgst, sgst, igst, cess);
        var total = input.TaxableValue + igst + cgst + sgst + cess;

        return new GstCalculationResult(input.TaxableValue, taxAmount, total);
    }

    /// <inheritdoc />
    public async Task<Result<decimal>> GetRateForHsnAsync(
        string hsnCode,
        DateOnly asOfDate,
        CancellationToken ct = default)
    {
        // DG-GST-06: Load both the tax_rate_name FK and the legacy flat rate in one query.
        // When tax_rate_name is populated we route through the temporal gst_tax_rate table
        // (valid_from <= asOfDate AND (valid_to IS NULL OR valid_to >= asOfDate)) so the
        // FY-versioned rate applies, honouring the asOfDate parameter the caller supplied.
        // Otherwise we fall back to the flat default_gst_rate_pct for backward compatibility
        // with rows that have not yet been linked to a named rate.
        var hsnEntry = await dbContext.HsnSacCodes
            .Where(h => h.Code == hsnCode && h.IsActive && h.DeletedAt == null)
            .Select(h => new { h.GstRatePct, h.TaxRateName })
            .FirstOrDefaultAsync(ct);

        if (hsnEntry is null)
        {
            logger.LogWarning(
                "HSN/SAC code '{HsnCode}' not found in the master table (asOfDate={AsOfDate})",
                hsnCode, asOfDate);
            return Error.NotFound("GstRate.NotFound",
                $"HSN/SAC code '{hsnCode}' is not in the master table.");
        }

        // ── Temporal path (DG-GST-06): rate name linked → query gst_tax_rate ──
        if (!string.IsNullOrWhiteSpace(hsnEntry.TaxRateName))
        {
            var temporalRate = await dbContext.GstTaxRates
                .Where(r =>
                    r.RateName == hsnEntry.TaxRateName
                    && r.IsActive
                    && r.DeletedAt == null
                    && r.ValidFrom <= asOfDate
                    && (r.ValidTo == null || r.ValidTo >= asOfDate))
                .OrderByDescending(r => r.ValidFrom)
                .Select(r => (decimal?)r.RatePct)
                .FirstOrDefaultAsync(ct);

            if (temporalRate is null)
            {
                logger.LogWarning(
                    "No temporal GST rate '{RateName}' effective on {AsOfDate} for HSN {HsnCode}",
                    hsnEntry.TaxRateName, asOfDate, hsnCode);
                return Error.NotFound("GstRate.NotFound",
                    $"No active GST rate '{hsnEntry.TaxRateName}' effective on {asOfDate:yyyy-MM-dd} " +
                    $"(HSN '{hsnCode}'). Update gst.gst_tax_rate for this financial year.");
            }

            logger.LogDebug(
                "Resolved GST rate {Rate}% for HSN '{HsnCode}' via temporal rate '{RateName}' (asOfDate={AsOfDate})",
                temporalRate.Value, hsnCode, hsnEntry.TaxRateName, asOfDate);
            return temporalRate.Value;
        }

        // ── Legacy fallback: no rate name linked — use flat default_gst_rate_pct ──
        if (hsnEntry.GstRatePct is null)
        {
            logger.LogWarning(
                "HSN/SAC code '{HsnCode}' has no tax_rate_name and no default_gst_rate_pct (asOfDate={AsOfDate})",
                hsnCode, asOfDate);
            return Error.NotFound("GstRate.NotFound",
                $"No GST rate configured for HSN/SAC code '{hsnCode}' as of {asOfDate:yyyy-MM-dd}. " +
                $"Set tax_rate_name on the HSN entry to enable FY-versioned rate resolution.");
        }

        logger.LogDebug(
            "Resolved GST rate {Rate}% for HSN '{HsnCode}' via legacy flat rate (asOfDate={AsOfDate} ignored — set tax_rate_name to enable temporal resolution)",
            hsnEntry.GstRatePct.Value, hsnCode, asOfDate);
        return hsnEntry.GstRatePct.Value;
    }
}
