using GstService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Production GSTN API client. Wired only when <c>GST_PRODUCTION_APIS_ENABLED == "true"</c>.
/// Implements retry with exponential backoff: 3 retries at 100ms, 1s, 5s.
/// P6-HANDOFF-15: Redacts Authorization headers, bearer tokens, and client_secret before logging.
/// </summary>
public sealed class ProductionGstnApiClient(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<ProductionGstnApiClient> logger) : IGstnApiClient
{
    private static readonly int[] RetryDelaysMs = [100, 1000, 5000];
    private const string BaseUrl = "https://api.gst.gov.in/commonapi/v1.1";

    /// <inheritdoc />
    public async Task<GstnApiResult> GetGstr2AAsync(string gstin, int year, int month, CancellationToken ct = default)
    {
        var url = $"{BaseUrl}/returns/gstr2a?action=B2B&gstin={Uri.EscapeDataString(gstin)}&ret_period={month:D2}{year}";
        return await ExecuteWithRetryAsync(url, HttpMethod.Get, null, ct);
    }

    /// <inheritdoc />
    public async Task<GstnApiResult> FileNilReturnAsync(string gstin, string returnType, int year, int month, CancellationToken ct = default)
    {
        var url = $"{BaseUrl}/returns/nilreturn";
        var body = JsonSerializer.Serialize(new
        {
            gstin,
            ret_period = $"{month:D2}{year}",
            return_type = returnType.ToUpperInvariant()
        });
        return await ExecuteWithRetryAsync(url, HttpMethod.Post, body, ct);
    }

    private async Task<GstnApiResult> ExecuteWithRetryAsync(
        string url, HttpMethod method, string? jsonBody, CancellationToken ct)
    {
        Exception? lastException = null;
        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                if (attempt > 0)
                {
                    var delay = RetryDelaysMs[attempt - 1];
                    logger.LogWarning("GSTN API retry attempt {Attempt} after {Delay}ms", attempt, delay);
                    await Task.Delay(delay, ct);
                }

                using var request = new HttpRequestMessage(method, url);
                AddAuthHeader(request);
                if (jsonBody is not null)
                    request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

                using var response = await httpClient.SendAsync(request, ct);
                var responseBody = await response.Content.ReadAsStringAsync(ct);
                var redacted = RedactSensitiveFields(responseBody);

                logger.LogInformation("GSTN API {Method} {Url} -> {StatusCode}", method, url, (int)response.StatusCode);

                if (!response.IsSuccessStatusCode)
                    return new GstnApiResult(false, null, redacted, $"HTTP {(int)response.StatusCode}");

                var arn = TryExtractArn(responseBody);
                return new GstnApiResult(true, arn, redacted, null);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastException = ex;
                logger.LogError(ex, "GSTN API attempt {Attempt} failed", attempt + 1);
            }
        }

        return new GstnApiResult(false, null, null, lastException?.Message ?? "Max retries exceeded");
    }

    private void AddAuthHeader(HttpRequestMessage request)
    {
        var clientId = configuration["GSTN_CLIENT_ID"];
        var clientSecret = configuration["GSTN_CLIENT_SECRET"];
        if (!string.IsNullOrEmpty(clientId))
            request.Headers.Add("clientid", clientId);
        if (!string.IsNullOrEmpty(clientSecret))
            request.Headers.Add("client-secret", "[REDACTED_IN_LOG]");
    }

    private static string RedactSensitiveFields(string json)
    {
        if (string.IsNullOrEmpty(json)) return json;
        // Redact common auth field patterns
        json = System.Text.RegularExpressions.Regex.Replace(
            json,
            @"""(access_token|bearer_token|client_secret|Authorization|auth_token)""\s*:\s*""[^""]*""",
            m =>
            {
                var colonIdx = m.Value.IndexOf(':', StringComparison.Ordinal);
                return m.Value.Substring(0, colonIdx + 1) + " \"[REDACTED]\"";
            },
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return json;
    }

    private static string? TryExtractArn(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("arn", out var arnEl))
                return arnEl.GetString();
        }
        catch { /* non-JSON response */ }
        return null;
    }
}
