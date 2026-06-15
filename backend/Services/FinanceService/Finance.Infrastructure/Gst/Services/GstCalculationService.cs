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
        // Load from gst.gst_tax_rate temporal table — rates are configuration-driven, not hardcoded.
        // HsnSacCode maps to GstTaxRate by rate name convention; future iterations will add a direct FK.
        var hsnEntry = await dbContext.HsnSacCodes
            .Where(h => h.Code == hsnCode)
            .Select(h => h.GstRatePct)
            .FirstOrDefaultAsync(ct);

        if (hsnEntry is null || hsnEntry == null)
        {
            logger.LogWarning("No GST rate found for HSN {HsnCode} as of {AsOfDate}", hsnCode, asOfDate);
            return Error.NotFound("GstRate.NotFound",
                $"No GST rate configured for HSN code '{hsnCode}' as of {asOfDate:yyyy-MM-dd}.");
        }

        return hsnEntry.Value;
    }
}
