using System.Net.Http.Json;
using DocumentService.Application.Documents.Interfaces;
using DocumentService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Storage;

namespace DocumentService.Infrastructure.Services.Ocr;

/// <summary>
/// Picks the OCR engine from the platform AI config (fetched from AuthService
/// <c>/auth/config/ai/effective</c>). Gemini/OpenAI/Anthropic require a configured key; otherwise
/// (and for the 'tesseract' provider) the free local Tesseract engine is used. Falls back to
/// Tesseract whenever the config can't be read or the provider isn't wired/keyed.
/// </summary>
public sealed class OcrServiceResolver(
    HttpClient http,
    IConfiguration configuration,
    ICloudStorageService storage,
    TesseractOcrService tesseract,
    ILoggerFactory loggerFactory,
    ILogger<OcrServiceResolver> logger) : IOcrServiceResolver
{
    private sealed record EffectiveConfig(
        string Provider, string? Model, string Tier, decimal ConfidenceThreshold,
        bool OcrEnabled, bool AutoClassifyEnabled, string? ApiKey);

    public async Task<ResolvedOcr> ResolveAsync(CancellationToken ct)
    {
        EffectiveConfig? cfg = null;
        try
        {
            var authBase = configuration["ServiceUrls:AuthService"] ?? "http://localhost:5101";
            cfg = await http.GetFromJsonAsync<EffectiveConfig>(
                $"{authBase.TrimEnd('/')}/auth/config/ai/effective", ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not fetch effective AI config — falling back to Tesseract.");
        }

        var provider = cfg?.Provider?.ToLowerInvariant() ?? "tesseract";

        if (provider == "gemini" && !string.IsNullOrEmpty(cfg?.ApiKey))
        {
            var model = string.IsNullOrWhiteSpace(cfg!.Model) ? "gemini-2.0-flash" : cfg.Model!;
            logger.LogInformation("OCR provider: gemini ({Model}).", model);
            return new ResolvedOcr(
                new GeminiOcrService(http, storage, cfg.ApiKey!, model, loggerFactory.CreateLogger<GeminiOcrService>()),
                "gemini", model);
        }

        if (provider is "openai" or "anthropic" or "document_ai")
        {
            logger.LogWarning(
                "OCR provider '{Provider}' selected but not wired in this build — using Tesseract.", provider);
        }

        return new ResolvedOcr(tesseract, "tesseract", "tesseract-ocr");
    }
}
