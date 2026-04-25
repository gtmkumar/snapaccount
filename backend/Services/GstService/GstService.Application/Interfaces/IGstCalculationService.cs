using GstService.Domain.ValueObjects;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Interfaces;

public record GstCalculationInput(
    decimal TaxableValue,
    decimal GstRatePct,
    decimal CessPct,
    bool IsInterState,
    string? SupplierState,
    string? BuyerState);

public record GstCalculationResult(
    decimal TaxableValue,
    TaxAmount TaxAmount,
    decimal TotalInvoiceValue);

public interface IGstCalculationService
{
    /// <summary>
    /// Calculates CGST/SGST (intra-state) or IGST (inter-state) based on supply type and HSN code.
    /// GST rates are configurable — fetched from gst.gst_tax_rate temporal table.
    /// </summary>
    Task<Result<GstCalculationResult>> CalculateAsync(GstCalculationInput input, CancellationToken ct = default);

    /// <summary>Get the applicable GST rate for an HSN/SAC code as of a given date.</summary>
    Task<Result<decimal>> GetRateForHsnAsync(string hsnCode, DateOnly asOfDate, CancellationToken ct = default);
}
