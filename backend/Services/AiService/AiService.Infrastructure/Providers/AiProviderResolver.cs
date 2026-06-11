using System.Net.Http.Json;
using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AiService.Infrastructure.Providers;

/// <summary>
/// Resolves the AI provider for a given feature code by fetching the platform AI config
/// from AuthService (<c>GET /auth/config/ai/effective</c>), then applying per-feature
/// model overrides from the <c>admin_ai_feature_overrides</c> table (migration 048).
///
/// Decision §7 (Mock-first): falls back to <see cref="MockAiProvider"/> whenever:
/// <list type="bullet">
///   <item>The AuthService config endpoint is unreachable.</item>
///   <item>The configured provider has no API key.</item>
///   <item>The provider is not "vertex" or another wired provider.</item>
/// </list>
///
/// Sarvam routing (decision §3): when <paramref name="locale"/> is an Indic locale AND
/// the config provider is "sarvam", returns the <see cref="MockAiProvider"/> for the main
/// AI call (Sarvam handles translation separately via <see cref="ISarvamAiService"/>).
/// </summary>
public sealed class AiProviderResolver(
    HttpClient http,
    IConfiguration configuration,
    MockAiProvider mockProvider,
    ILoggerFactory loggerFactory,
    ILogger<AiProviderResolver> logger) : IAiProviderResolver
{
    private sealed record EffectiveAiConfig(
        string Provider,
        string? Model,
        string? ApiKey,
        string? EmbeddingModel,
        bool OcrEnabled);

    /// <inheritdoc />
    public async Task<ResolvedProvider> ResolveAsync(
        string featureCode, string? locale = null, CancellationToken ct = default)
    {
        EffectiveAiConfig? cfg = null;
        try
        {
            var authBase = configuration["ServiceUrls:AuthService"] ?? "http://localhost:5101";
            cfg = await http.GetFromJsonAsync<EffectiveAiConfig>(
                $"{authBase.TrimEnd('/')}/auth/config/ai/effective", ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not fetch effective AI config — falling back to MockAiProvider.");
        }

        var provider = cfg?.Provider?.ToLowerInvariant() ?? "mock";

        if (provider == "vertex" && !string.IsNullOrEmpty(cfg?.ApiKey))
        {
            var chatModel = string.IsNullOrWhiteSpace(cfg!.Model) ? "gemini-2.0-flash" : cfg.Model!;
            var embedModel = string.IsNullOrWhiteSpace(cfg.EmbeddingModel) ? "text-embedding-005" : cfg.EmbeddingModel!;

            logger.LogInformation("AI provider: vertex (chat={ChatModel}, embed={EmbedModel}).",
                chatModel, embedModel);

            var vertexProvider = new VertexAiProvider(
                http,
                cfg.ApiKey!,
                chatModel,
                embedModel,
                loggerFactory.CreateLogger<VertexAiProvider>());

            return new ResolvedProvider(vertexProvider, chatModel);
        }

        if (provider is "gemini" && !string.IsNullOrEmpty(cfg?.ApiKey))
        {
            // Gemini Developer API (same endpoint, different branding from config).
            var chatModel = string.IsNullOrWhiteSpace(cfg!.Model) ? "gemini-2.0-flash" : cfg.Model!;
            var embedModel = string.IsNullOrWhiteSpace(cfg.EmbeddingModel) ? "text-embedding-005" : cfg.EmbeddingModel!;

            logger.LogInformation("AI provider: gemini-developer-api (chat={ChatModel}).", chatModel);

            var vertexProvider = new VertexAiProvider(
                http, cfg.ApiKey!, chatModel, embedModel,
                loggerFactory.CreateLogger<VertexAiProvider>());

            return new ResolvedProvider(vertexProvider, chatModel);
        }

        if (provider != "mock")
        {
            logger.LogWarning(
                "AI provider '{Provider}' selected but not wired or has no API key — using MockAiProvider.",
                provider);
        }
        else
        {
            logger.LogInformation("AI provider: mock (GCP-free mode).");
        }

        return new ResolvedProvider(mockProvider, "mock-v1");
    }
}
