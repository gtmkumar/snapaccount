using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// MSG91 OTP API integration.
///
/// Endpoint: https://control.msg91.com/api/v5/otp
/// Required configuration:
///   - <c>Msg91:OtpAuthKey</c>      MSG91 auth key
///   - <c>Msg91:OtpTemplateId</c>   DLT-registered OTP template id (TRAI mandatory)
///   - <c>Msg91:OtpSenderId</c>     6-char sender id (e.g. "SNAPAC")
///
/// If config is missing the service logs an error and returns false rather than
/// throwing — the OTP row is already persisted so the user can be told "try
/// again" via the existing API contract; production must be alerted via the
/// error-rate dashboard rather than crashing the request.
/// </summary>
public sealed class Msg91OtpSmsSender(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<Msg91OtpSmsSender> logger) : IOtpSmsSender
{
    private const string MsgEndpoint = "https://control.msg91.com/api/v5/otp";

    private readonly string? _authKey = configuration["Msg91:OtpAuthKey"]
        ?? configuration["Msg91:ApiKey"]; // back-compat with NotificationService key
    private readonly string? _templateId = configuration["Msg91:OtpTemplateId"];
    private readonly string? _senderId = configuration["Msg91:OtpSenderId"] ?? "SNAPAC";

    public async Task<bool> SendOtpAsync(string phoneNumber, string otp, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_authKey) || string.IsNullOrWhiteSpace(_templateId))
        {
            logger.LogError(
                "MSG91 OTP not configured (Msg91:OtpAuthKey or Msg91:OtpTemplateId missing). " +
                "OTP for {Phone} not delivered.", Mask(phoneNumber));
            return false;
        }

        // MSG91 wants country code separated; phone is stored as +91XXXXXXXXXX.
        var trimmed = phoneNumber.TrimStart('+');
        var queryString = $"?template_id={Uri.EscapeDataString(_templateId)}" +
                          $"&mobile={Uri.EscapeDataString(trimmed)}" +
                          $"&authkey={Uri.EscapeDataString(_authKey)}" +
                          $"&otp={Uri.EscapeDataString(otp)}" +
                          $"&sender={Uri.EscapeDataString(_senderId!)}";

        var client = httpClientFactory.CreateClient("Msg91Otp");

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, MsgEndpoint + queryString);
            using var response = await client.SendAsync(req, ct);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(ct);
                logger.LogError(
                    "MSG91 OTP returned {Status} for {Phone}: {Body}",
                    response.StatusCode, Mask(phoneNumber), Truncate(body, 200));
                return false;
            }

            // MSG91 returns { "type": "success" } | { "type": "error", "message": "..." }
            var body2 = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body2);
            var ok = doc.RootElement.TryGetProperty("type", out var typeProp)
                  && string.Equals(typeProp.GetString(), "success", StringComparison.OrdinalIgnoreCase);

            if (!ok)
                logger.LogError("MSG91 OTP non-success response for {Phone}: {Body}",
                    Mask(phoneNumber), Truncate(body2, 200));
            else
                logger.LogInformation("MSG91 OTP sent to {Phone}", Mask(phoneNumber));

            return ok;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "MSG91 OTP send failed for {Phone}", Mask(phoneNumber));
            return false;
        }
    }

    /// <summary>Last-4 mask for log lines (DPDP — never log full phone numbers).</summary>
    private static string Mask(string phone)
        => phone.Length >= 4 ? new string('*', phone.Length - 4) + phone[^4..] : phone;

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..max] + "...";
}
