using GstService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Text.Json;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Production IRP client for IRN generation. Wired only when <c>GST_PRODUCTION_APIS_ENABLED == "true"</c>.
/// Retry: 3 attempts at 100ms, 1s, 5s.
/// P6-HANDOFF-15: Redacts Authorization headers and bearer tokens before any storage/logging.
/// </summary>
public sealed class ProductionIrpClient(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<ProductionIrpClient> logger) : IIrpClient
{
    private static readonly int[] RetryDelaysMs = [100, 1000, 5000];
    private const string BaseUrl = "https://api.invoice-registration.nic.in/v1.03";

    /// <inheritdoc />
    public async Task<IrpApiResult> GenerateIrnAsync(IrpInvoicePayload payload, CancellationToken ct = default)
    {
        var requestBody = JsonSerializer.Serialize(new
        {
            Version = "1.1",
            TranDtls = new { TaxSch = "GST", SupTyp = payload.InvoiceType, IgstOnIntra = "N" },
            DocDtls = new
            {
                Typ = payload.InvoiceType,
                No = payload.InvoiceNumber,
                Dt = payload.InvoiceDate.ToString("dd/MM/yyyy")
            },
            SellerDtls = new { Gstin = payload.SupplierGstin },
            BuyerDtls = new { Gstin = payload.BuyerGstin ?? "URP", Pos = "96" },
            ValDtls = new
            {
                AssVal = payload.TaxableValue,
                IgstVal = payload.IgstAmount,
                CgstVal = payload.CgstAmount,
                SgstVal = payload.SgstAmount,
                CesVal = payload.CessAmount,
                TotInvVal = payload.TotalValue
            }
        });

        Exception? lastException = null;
        string? redactedRequest = RedactSensitiveFields(requestBody);

        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                if (attempt > 0)
                    await Task.Delay(RetryDelaysMs[attempt - 1], ct);

                using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/einvoice/auth");
                AddAuthHeader(request);
                request.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");

                using var response = await httpClient.SendAsync(request, ct);
                var responseBody = await response.Content.ReadAsStringAsync(ct);
                var redactedResponse = RedactSensitiveFields(responseBody);

                logger.LogInformation("IRP GenerateIrn invoice={InvoiceNumber} status={Status}",
                    payload.InvoiceNumber, (int)response.StatusCode);

                if (!response.IsSuccessStatusCode)
                    return new IrpApiResult(false, null, null, null, null, null, redactedRequest, redactedResponse, $"HTTP {(int)response.StatusCode}");

                var parsed = ParseIrnResponse(responseBody);
                return new IrpApiResult(
                    IsSuccess: true,
                    IrnNumber: parsed.Irn,
                    AckNumber: parsed.AckNo,
                    AckDate: parsed.AckDt,
                    SignedInvoiceData: parsed.SignedInvoice,
                    SignedQrCode: parsed.SignedQrCode,
                    RedactedRequestJson: redactedRequest,
                    RedactedResponseJson: redactedResponse,
                    ErrorMessage: null);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastException = ex;
                logger.LogError(ex, "IRP attempt {Attempt} failed", attempt + 1);
            }
        }

        return new IrpApiResult(false, null, null, null, null, null, redactedRequest, null, lastException?.Message ?? "Max retries exceeded");
    }

    /// <inheritdoc />
    public async Task<IrpCancelResult> CancelIrnAsync(string irn, string cancelReason, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                if (attempt > 0)
                    await Task.Delay(RetryDelaysMs[attempt - 1], ct);

                var body = JsonSerializer.Serialize(new { Irn = irn, CnlRsn = "1", CnlRem = cancelReason });
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/einvoice/cancel");
                AddAuthHeader(request);
                request.Content = new StringContent(body, Encoding.UTF8, "application/json");

                using var response = await httpClient.SendAsync(request, ct);
                if (response.IsSuccessStatusCode)
                    return new IrpCancelResult(true, null);

                var err = await response.Content.ReadAsStringAsync(ct);
                return new IrpCancelResult(false, $"HTTP {(int)response.StatusCode}: {err}");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "IRP CancelIrn attempt {Attempt} failed", attempt + 1);
            }
        }

        return new IrpCancelResult(false, "Max retries exceeded");
    }

    private void AddAuthHeader(HttpRequestMessage request)
    {
        var clientId = configuration["IRP_CLIENT_ID"];
        if (!string.IsNullOrEmpty(clientId))
            request.Headers.Add("clientid", clientId);
        // client_secret added as header — never logged
        var secret = configuration["IRP_CLIENT_SECRET"];
        if (!string.IsNullOrEmpty(secret))
            request.Headers.Add("client-secret", secret);
    }

    private static string RedactSensitiveFields(string json)
    {
        if (string.IsNullOrEmpty(json)) return json;
        return System.Text.RegularExpressions.Regex.Replace(
            json,
            @"""(access_token|bearer_token|client_secret|Authorization|auth_token|BearerToken)""\s*:\s*""[^""]*""",
            m =>
            {
                var colonIdx = m.Value.IndexOf(':', StringComparison.Ordinal);
                return m.Value.Substring(0, colonIdx + 1) + " \"[REDACTED]\"";
            },
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }

    private static (string? Irn, string? AckNo, DateTime? AckDt, string? SignedInvoice, string? SignedQrCode) ParseIrnResponse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            string? irn = root.TryGetProperty("Irn", out var p) ? p.GetString() : null;
            string? ackNo = root.TryGetProperty("AckNo", out p) ? p.GetString() : null;
            string? ackDtStr = root.TryGetProperty("AckDt", out p) ? p.GetString() : null;
            string? signed = root.TryGetProperty("SignedInvoice", out p) ? p.GetString() : null;
            string? qr = root.TryGetProperty("SignedQRCode", out p) ? p.GetString() : null;
            DateTime? ackDt = ackDtStr is not null ? DateTime.TryParse(ackDtStr, out var dt) ? dt : null : null;
            return (irn, ackNo, ackDt, signed, qr);
        }
        catch { return (null, null, null, null, null); }
    }
}
