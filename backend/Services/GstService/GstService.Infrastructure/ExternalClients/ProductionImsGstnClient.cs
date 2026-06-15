using GstService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Production GSTN IMS API client. Wired only when <c>GST_PRODUCTION_APIS_ENABLED == "true"</c>.
/// Implements retry with exponential backoff (3 retries: 100ms, 1s, 5s) matching the pattern
/// in <see cref="ProductionGstnApiClient"/>.
///
/// TODO: Obtain GSTN IMS API credentials (client_id, client_secret, OTP-based session token)
///       from Secret Manager keys: GSTN_CLIENT_ID, GSTN_CLIENT_SECRET, GSTN_IMS_SESSION_TOKEN.
///       IMS API base: https://api.gst.gov.in/commonapi/v1.1/ims
///       Authentication: OTP-based GSTN session token in "auth-token" header.
///
/// P6-HANDOFF-15: All implementations must redact Authorization / bearer tokens
/// from request/response payloads before logging.
/// </summary>
public sealed class ProductionImsGstnClient(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<ProductionImsGstnClient> logger) : IImsGstnClient
{
    private static readonly int[] RetryDelaysMs = [100, 1000, 5000];
    private const string BaseUrl = "https://api.gst.gov.in/commonapi/v1.1/ims";

    /// <inheritdoc />
    public async Task<ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>> GetImsInvoicesAsync(
        string gstin, string period, CancellationToken ct = default)
    {
        // TODO: Wire actual GSTN IMS fetch endpoint URL once API spec is confirmed with GSTN ASP.
        // Expected: GET /ims/invoice?action=GET&gstin={gstin}&ret_period={period}
        var url = $"{BaseUrl}/invoice?action=GET&gstin={Uri.EscapeDataString(gstin)}&ret_period={period}";
        var rawResult = await ExecuteWithRetryAsync(url, HttpMethod.Get, null, ct);
        if (!rawResult.IsSuccess)
            return new ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>(false, null, rawResult.RedactedResponseJson, rawResult.ErrorMessage);

        try
        {
            var records = ParseInvoiceRecords(rawResult.RedactedResponseJson ?? "{}");
            return new ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>(true, records, rawResult.RedactedResponseJson, null);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to parse GSTN IMS invoice response");
            return new ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>(false, null, rawResult.RedactedResponseJson, "Parse error");
        }
    }

    /// <inheritdoc />
    public async Task<ImsApiResult<string>> SubmitActionAsync(
        string gstin, string period, string invoiceNumber,
        string supplierGstin, string action, string? reason, CancellationToken ct = default)
    {
        // TODO: Wire actual GSTN IMS action endpoint URL once API spec is confirmed.
        var url = $"{BaseUrl}/invoice/action";
        var body = JsonSerializer.Serialize(new
        {
            gstin,
            ret_period = period,
            invoice_details = new[]
            {
                new { invoice_no = invoiceNumber, supplier_gstin = supplierGstin, action, reason }
            }
        });
        return await ExecuteWithRetryAsync(url, HttpMethod.Post, body, ct);
    }

    /// <inheritdoc />
    public async Task<ImsApiResult<string>> SubmitBulkActionsAsync(
        string gstin, string period, IReadOnlyList<ImsBulkActionItem> actions, CancellationToken ct = default)
    {
        var url = $"{BaseUrl}/invoice/action/bulk";
        var body = JsonSerializer.Serialize(new
        {
            gstin,
            ret_period = period,
            invoice_details = actions.Select(a => new
            {
                invoice_no = a.InvoiceNumber,
                supplier_gstin = a.SupplierGstin,
                action = a.Action,
                reason = a.Reason
            }).ToArray()
        });
        return await ExecuteWithRetryAsync(url, HttpMethod.Post, body, ct);
    }

    private async Task<ImsApiResult<string>> ExecuteWithRetryAsync(
        string url, HttpMethod method, string? jsonBody, CancellationToken ct)
    {
        Exception? lastException = null;
        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                if (attempt > 0)
                {
                    logger.LogWarning("GSTN IMS API retry attempt {Attempt} after {Delay}ms", attempt, RetryDelaysMs[attempt - 1]);
                    await Task.Delay(RetryDelaysMs[attempt - 1], ct);
                }

                using var request = new HttpRequestMessage(method, url);
                AddAuthHeaders(request);
                if (jsonBody is not null)
                    request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

                using var response = await httpClient.SendAsync(request, ct);
                var responseBody = await response.Content.ReadAsStringAsync(ct);
                var redacted = RedactSensitiveFields(responseBody);

                logger.LogInformation("GSTN IMS API {Method} {Url} -> {StatusCode}", method, url, (int)response.StatusCode);

                if (!response.IsSuccessStatusCode)
                    return new ImsApiResult<string>(false, null, redacted, $"HTTP {(int)response.StatusCode}");

                return new ImsApiResult<string>(true, redacted, redacted, null);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastException = ex;
                logger.LogError(ex, "GSTN IMS API attempt {Attempt} failed", attempt + 1);
            }
        }
        return new ImsApiResult<string>(false, null, null, lastException?.Message ?? "Max retries exceeded");
    }

    private void AddAuthHeaders(HttpRequestMessage request)
    {
        var clientId = configuration["GSTN_CLIENT_ID"];
        var sessionToken = configuration["GSTN_IMS_SESSION_TOKEN"];
        if (!string.IsNullOrEmpty(clientId))
            request.Headers.Add("clientid", clientId);
        // auth-token is session-based (OTP flow); redact from all logs
        if (!string.IsNullOrEmpty(sessionToken))
            request.Headers.Add("auth-token", "[REDACTED_IN_LOG]");
    }

    private static string RedactSensitiveFields(string json)
    {
        if (string.IsNullOrEmpty(json)) return json;
        return Regex.Replace(
            json,
            @"""(access_token|bearer_token|client_secret|Authorization|auth_token|auth-token)""\s*:\s*""[^""]*""",
            m =>
            {
                var colonIdx = m.Value.IndexOf(':', StringComparison.Ordinal);
                return m.Value[..(colonIdx + 1)] + " \"[REDACTED]\"";
            },
            RegexOptions.IgnoreCase);
    }

    private static IReadOnlyList<ImsInvoiceRecord> ParseInvoiceRecords(string json)
    {
        // TODO: Replace with actual GSTN IMS response schema once API spec is available.
        // Placeholder returns empty list — prevents null reference in calling code.
        return [];
    }
}
