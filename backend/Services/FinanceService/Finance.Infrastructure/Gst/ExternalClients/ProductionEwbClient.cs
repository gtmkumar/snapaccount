using GstService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Text.Json;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Production E-Way Bill client. Wired only when <c>GST_PRODUCTION_APIS_ENABLED == "true"</c>.
/// Retry: 3 attempts at 100ms, 1s, 5s.
/// P6-HANDOFF-15: Redacts auth tokens before storage.
/// </summary>
public sealed class ProductionEwbClient(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<ProductionEwbClient> logger) : IEwbClient
{
    private static readonly int[] RetryDelaysMs = [100, 1000, 5000];
    private const string BaseUrl = "https://api.ewaybillgst.gov.in/ewayapi/v2.0";

    /// <inheritdoc />
    public async Task<EwbApiResult> GenerateEwbAsync(EwbPayload payload, CancellationToken ct = default)
    {
        var requestBody = JsonSerializer.Serialize(new
        {
            supplyType = payload.SupplyType,
            subSupplyType = payload.SubSupplyType,
            subSupplyDesc = "",
            docType = "INV",
            docDate = DateTime.UtcNow.ToString("dd/MM/yyyy"),
            fromGstin = payload.SupplierGstin,
            toGstin = payload.BuyerGstin,
            fromTrdName = "",
            toTrdName = "",
            fromStateCode = 0,
            toStateCode = 0,
            fromAddr1 = payload.FromPlace,
            fromPincode = int.TryParse(payload.FromPincode, out var fp) ? fp : 0,
            toAddr1 = payload.ToPlace,
            toPincode = int.TryParse(payload.ToPincode, out var tp) ? tp : 0,
            transactionType = 1,
            transType = 1,
            transName = payload.TransporterId,
            transId = payload.TransporterId,
            transDocNo = "",
            vehicleNo = payload.VehicleNumber,
            vehicleType = payload.VehicleType ?? "R",
            totalValue = payload.TotalValue,
            distance = payload.DistanceKm ?? 0
        });

        var redactedRequest = RedactSensitiveFields(requestBody);
        Exception? lastException = null;

        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                if (attempt > 0)
                    await Task.Delay(RetryDelaysMs[attempt - 1], ct);

                using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/ewayapi/genewaybill");
                AddAuthHeader(request);
                request.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");

                using var response = await httpClient.SendAsync(request, ct);
                var responseBody = await response.Content.ReadAsStringAsync(ct);
                var redactedResponse = RedactSensitiveFields(responseBody);

                logger.LogInformation("EWB Generate attempt {Attempt} status={Status}", attempt + 1, (int)response.StatusCode);

                if (!response.IsSuccessStatusCode)
                    return new EwbApiResult(false, null, null, redactedRequest, redactedResponse, $"HTTP {(int)response.StatusCode}");

                var (ewbNumber, validUpto) = ParseEwbResponse(responseBody);
                return new EwbApiResult(true, ewbNumber, validUpto, redactedRequest, redactedResponse, null);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastException = ex;
                logger.LogError(ex, "EWB attempt {Attempt} failed", attempt + 1);
            }
        }

        return new EwbApiResult(false, null, null, redactedRequest, null, lastException?.Message ?? "Max retries exceeded");
    }

    /// <inheritdoc />
    public async Task<EwbCancelResult> CancelEwbAsync(string ewbNumber, string cancelReason, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                if (attempt > 0)
                    await Task.Delay(RetryDelaysMs[attempt - 1], ct);

                var body = JsonSerializer.Serialize(new { ewbNo = ewbNumber, cancelRsnCode = 1, cancelRmrk = cancelReason });
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/ewayapi/candocewb");
                AddAuthHeader(request);
                request.Content = new StringContent(body, Encoding.UTF8, "application/json");

                using var response = await httpClient.SendAsync(request, ct);
                if (response.IsSuccessStatusCode)
                    return new EwbCancelResult(true, null);

                var err = await response.Content.ReadAsStringAsync(ct);
                return new EwbCancelResult(false, $"HTTP {(int)response.StatusCode}: {err}");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "EWB CancelEwb attempt {Attempt} failed", attempt + 1);
            }
        }
        return new EwbCancelResult(false, "Max retries exceeded");
    }

    private void AddAuthHeader(HttpRequestMessage request)
    {
        var clientId = configuration["EWB_CLIENT_ID"];
        if (!string.IsNullOrEmpty(clientId))
            request.Headers.Add("Gstin", clientId);
        var secret = configuration["EWB_CLIENT_SECRET"];
        if (!string.IsNullOrEmpty(secret))
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", secret);
    }

    private static string RedactSensitiveFields(string json)
    {
        if (string.IsNullOrEmpty(json)) return json;
        return System.Text.RegularExpressions.Regex.Replace(
            json,
            @"""(access_token|bearer_token|client_secret|Authorization|auth_token)""\s*:\s*""[^""]*""",
            m =>
            {
                var colonIdx = m.Value.IndexOf(':', StringComparison.Ordinal);
                return m.Value.Substring(0, colonIdx + 1) + " \"[REDACTED]\"";
            },
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }

    private static (string? EwbNumber, DateTime? ValidUpto) ParseEwbResponse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            string? ewb = root.TryGetProperty("ewayBillNo", out var p) ? p.GetString() : null;
            string? validStr = root.TryGetProperty("validUpto", out p) ? p.GetString() : null;
            DateTime? valid = validStr is not null && DateTime.TryParse(validStr, out var dt) ? dt : null;
            return (ewb, valid);
        }
        catch { return (null, null); }
    }
}
