using System.Net.Http.Json;
using System.Text.Json;
using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace AiService.Infrastructure.Services;

/// <summary>
/// Real Sarvam AI service — used when <c>Sarvam:ApiKey</c> is configured in the admin AI config.
/// Calls the Sarvam Translate API (<c>https://api.sarvam.ai/translate</c>).
/// Activated by <see cref="AiService.Infrastructure.DependencyInjection.AddAiInfrastructure"/>
/// when the Sarvam API key is present.
/// </summary>
public sealed class SarvamAiService(
    HttpClient http,
    string apiKey,
    ILogger<SarvamAiService> logger) : ISarvamAiService
{
    private const string TranslateUrl = "https://api.sarvam.ai/translate";

    /// <inheritdoc />
    public async Task<Result<string>> TranslateToEnglishAsync(string text, string sourceLocale, CancellationToken ct = default)
        => await TranslateAsync(text, sourceLocale, "en-IN", ct);

    /// <inheritdoc />
    public async Task<Result<string>> TranslateFromEnglishAsync(string englishText, string targetLocale, CancellationToken ct = default)
        => await TranslateAsync(englishText, "en-IN", targetLocale, ct);

    private async Task<Result<string>> TranslateAsync(
        string text, string sourceLang, string targetLang, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, TranslateUrl)
            {
                Content = JsonContent.Create(new
                {
                    input = text,
                    source_language_code = sourceLang,
                    target_language_code = targetLang,
                    speaker_gender = "Female",
                    mode = "formal",
                    model = "mayura:v1",
                    enable_preprocessing = false,
                }),
            };
            req.Headers.Add("API-Subscription-Key", apiKey);

            using var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                logger.LogWarning("Sarvam translate HTTP {Code}: {Err}", (int)resp.StatusCode,
                    err.Length > 200 ? err[..200] : err);
                return new Error("Sarvam.Http", $"Sarvam AI returned {(int)resp.StatusCode}.");
            }

            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            var translated = doc.RootElement.GetProperty("translated_text").GetString();
            return Result<string>.Success(translated ?? text);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Sarvam translate failed.");
            return new Error("Sarvam.Error", $"Sarvam AI translate failed: {ex.Message}");
        }
    }
}
