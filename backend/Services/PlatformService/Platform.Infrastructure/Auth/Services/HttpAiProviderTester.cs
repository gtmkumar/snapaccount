using AuthService.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Validates a provider API key with a cheap, read-only call (list models / auth check) — no
/// token generation, so "Test connection" is free. Unknown providers report key-present only.
/// </summary>
public sealed class HttpAiProviderTester(HttpClient http, ILogger<HttpAiProviderTester> logger) : IAiProviderTester
{
    public async Task<(bool ok, string message)> TestAsync(string provider, string apiKey, string? model, CancellationToken ct)
    {
        try
        {
            switch (provider)
            {
                case "gemini":
                {
                    // Listing models validates the key without generating content.
                    using var resp = await http.GetAsync(
                        $"https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}", ct);
                    return resp.IsSuccessStatusCode
                        ? (true, $"Connected to Google Gemini ({model ?? "default model"}).")
                        : (false, $"Gemini rejected the key (HTTP {(int)resp.StatusCode}).");
                }
                case "openai":
                {
                    using var req = new HttpRequestMessage(HttpMethod.Get, "https://api.openai.com/v1/models");
                    req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {apiKey}");
                    using var resp = await http.SendAsync(req, ct);
                    return resp.IsSuccessStatusCode
                        ? (true, "Connected to OpenAI.")
                        : (false, $"OpenAI rejected the key (HTTP {(int)resp.StatusCode}).");
                }
                case "anthropic":
                {
                    // Minimal models list (x-api-key auth) — validates the key.
                    using var req = new HttpRequestMessage(HttpMethod.Get, "https://api.anthropic.com/v1/models");
                    req.Headers.TryAddWithoutValidation("x-api-key", apiKey);
                    req.Headers.TryAddWithoutValidation("anthropic-version", "2023-06-01");
                    using var resp = await http.SendAsync(req, ct);
                    return resp.IsSuccessStatusCode
                        ? (true, "Connected to Anthropic Claude.")
                        : (false, $"Anthropic rejected the key (HTTP {(int)resp.StatusCode}).");
                }
                default:
                    return (true, $"Key present for '{provider}' (no live check available).");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI provider test failed for {Provider}.", provider);
            return (false, $"Connection failed: {ex.Message}");
        }
    }
}
