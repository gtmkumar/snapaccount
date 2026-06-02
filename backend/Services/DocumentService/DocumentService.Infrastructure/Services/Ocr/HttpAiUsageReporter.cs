using System.Net.Http.Json;
using DocumentService.Application.Documents.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace DocumentService.Infrastructure.Services.Ocr;

/// <summary>
/// Posts metered AI usage to AuthService <c>POST /auth/config/ai/usage</c>. Best-effort: any
/// failure is logged and swallowed so OCR is never affected by telemetry. Forwards the caller's
/// bearer token so the authenticated endpoint accepts the service-to-service write.
/// </summary>
public sealed class HttpAiUsageReporter(
    HttpClient http,
    IConfiguration configuration,
    IHttpContextAccessor httpContextAccessor,
    ILogger<HttpAiUsageReporter> logger) : IAiUsageReporter
{
    public async Task ReportAsync(string provider, string model, string feature,
        int inputTokens, int outputTokens, int units, int latencyMs, Guid? organizationId, CancellationToken ct)
    {
        try
        {
            var authBase = configuration["ServiceUrls:AuthService"] ?? "http://localhost:5101";
            var body = new
            {
                provider, model, feature,
                inputTokens, outputTokens, units, latencyMs,
                organizationId,
            };
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{authBase.TrimEnd('/')}/auth/config/ai/usage")
            {
                Content = JsonContent.Create(body),
            };
            // Forward the incoming request's Authorization header (the endpoint requires auth).
            var authHeader = httpContextAccessor.HttpContext?.Request.Headers.Authorization.ToString();
            if (!string.IsNullOrEmpty(authHeader))
                req.Headers.TryAddWithoutValidation("Authorization", authHeader);

            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
                logger.LogWarning("AI usage report returned {Code}.", (int)resp.StatusCode);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI usage report failed (non-fatal).");
        }
    }
}
