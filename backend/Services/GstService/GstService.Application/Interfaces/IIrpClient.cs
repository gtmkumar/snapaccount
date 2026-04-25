namespace GstService.Application.Interfaces;

/// <summary>
/// Abstraction over the IRP (Invoice Registration Portal) API for e-invoice IRN generation.
/// P6-HANDOFF-15: All implementations must redact API tokens before storing payloads.
/// Threshold check: only applicable if org annual_turnover_cr &gt; 5.
/// </summary>
public interface IIrpClient
{
    /// <summary>
    /// Generates an IRN (Invoice Reference Number) for the given invoice payload.
    /// Returns the IRN, ACK number, signed QR, and signed invoice JSON.
    /// </summary>
    Task<IrpApiResult> GenerateIrnAsync(IrpInvoicePayload payload, CancellationToken ct = default);

    /// <summary>
    /// Cancels an existing IRN on the IRP portal.
    /// </summary>
    Task<IrpCancelResult> CancelIrnAsync(string irn, string cancelReason, CancellationToken ct = default);
}

/// <summary>Invoice payload sent to IRP for IRN generation.</summary>
public sealed record IrpInvoicePayload(
    string SupplierGstin,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    string InvoiceType,
    decimal TaxableValue,
    decimal IgstAmount,
    decimal CgstAmount,
    decimal SgstAmount,
    decimal CessAmount,
    decimal TotalValue,
    string? BuyerGstin);

/// <summary>Result from IRP IRN generation.</summary>
public sealed record IrpApiResult(
    bool IsSuccess,
    string? IrnNumber,
    string? AckNumber,
    DateTime? AckDate,
    string? SignedInvoiceData,
    string? SignedQrCode,
    string? RedactedRequestJson,
    string? RedactedResponseJson,
    string? ErrorMessage);

/// <summary>Result from IRP IRN cancellation.</summary>
public sealed record IrpCancelResult(
    bool IsSuccess,
    string? ErrorMessage);
