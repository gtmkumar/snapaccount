namespace GstService.Application.Interfaces;

/// <summary>
/// Abstraction over the GSTN (GST Network) API for return filing and ledger queries.
/// P6-HANDOFF-15: All implementations must redact Authorization headers and bearer tokens
/// from request/response payloads before storage.
/// </summary>
public interface IGstnApiClient
{
    /// <summary>
    /// Fetches the GSTR-2A data for a given GSTIN and return period.
    /// Returns a raw JSON payload (redacted of auth headers before logging).
    /// </summary>
    Task<GstnApiResult> GetGstr2AAsync(string gstin, int year, int month, CancellationToken ct = default);

    /// <summary>
    /// Files a nil return on the GSTN portal.
    /// Returns the ARN (Acknowledgement Reference Number) on success.
    /// </summary>
    Task<GstnApiResult> FileNilReturnAsync(string gstin, string returnType, int year, int month, CancellationToken ct = default);
}

/// <summary>Result from a GSTN API call — includes redacted payload and ARN if applicable.</summary>
public sealed record GstnApiResult(
    bool IsSuccess,
    string? Arn,
    string? RedactedResponseJson,
    string? ErrorMessage);
