namespace GstService.Application.Interfaces;

/// <summary>
/// Abstraction over the GSTN IMS (Invoice Management System) API.
/// Implementations must redact Authorization headers and bearer tokens
/// from request/response payloads before logging (P6-HANDOFF-15 convention).
///
/// Production API base: https://api.gst.gov.in/commonapi/v1.1/ims
/// (Refer to GSTN IMS API specification, circular 2025 and CGST rule amendments 2025)
/// </summary>
public interface IImsGstnClient
{
    /// <summary>
    /// Fetches inward invoices visible in the IMS inbox for a given GSTIN and period.
    /// Period format: MMYYYY (e.g. "032026" for March 2026).
    /// </summary>
    Task<ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>> GetImsInvoicesAsync(
        string gstin,
        string period,
        CancellationToken ct = default);

    /// <summary>
    /// Submits a single invoice action (accept/reject/pending) to GSTN IMS.
    /// Idempotent — GSTN portal deduplicates by (gstin, invoice_number, period).
    /// </summary>
    Task<ImsApiResult<string>> SubmitActionAsync(
        string gstin,
        string period,
        string invoiceNumber,
        string supplierGstin,
        string action,
        string? reason,
        CancellationToken ct = default);

    /// <summary>
    /// Submits bulk invoice actions (up to 100 per call per GSTN rate limit).
    /// Returns a tracking reference; poll GetBulkActionStatusAsync for completion.
    /// </summary>
    Task<ImsApiResult<string>> SubmitBulkActionsAsync(
        string gstin,
        string period,
        IReadOnlyList<ImsBulkActionItem> actions,
        CancellationToken ct = default);
}

/// <summary>Result wrapper for all IMS API calls.</summary>
public sealed record ImsApiResult<T>(
    bool IsSuccess,
    T? Data,
    string? RedactedResponseJson,
    string? ErrorMessage);

/// <summary>An inward invoice as returned by the GSTN IMS API.</summary>
public sealed record ImsInvoiceRecord(
    string SupplierGstin,
    string SupplierName,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    decimal InvoiceValue,
    decimal TaxableValue,
    decimal IgstAmount,
    decimal CgstAmount,
    decimal SgstAmount,
    decimal CessAmount,
    string Source); // GSTR-1 | IFF

/// <summary>One item in a bulk IMS action request.</summary>
public sealed record ImsBulkActionItem(
    string InvoiceNumber,
    string SupplierGstin,
    string Action, // ACCEPTED | REJECTED | PENDING_KEPT
    string? Reason);
