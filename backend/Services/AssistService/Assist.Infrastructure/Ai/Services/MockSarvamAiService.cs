using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace AiService.Infrastructure.Services;

/// <summary>
/// Mock Sarvam AI service — used when the Sarvam API key is not configured.
/// Returns the input text unchanged (English pass-through) so the system degrades
/// gracefully rather than failing on Indic-locale requests in local/CI.
/// </summary>
public sealed class MockSarvamAiService(ILogger<MockSarvamAiService> logger) : ISarvamAiService
{
    /// <inheritdoc />
    public Task<Result<string>> TranslateToEnglishAsync(string text, string sourceLocale, CancellationToken ct = default)
    {
        logger.LogWarning(
            "[MOCK-SARVAM] TranslateToEnglish called (locale={Locale}, textLen={Len}). " +
            "Returning original text (no Sarvam key configured).", sourceLocale, text.Length);
        return Task.FromResult(Result<string>.Success(text));
    }

    /// <inheritdoc />
    public Task<Result<string>> TranslateFromEnglishAsync(string englishText, string targetLocale, CancellationToken ct = default)
    {
        logger.LogWarning(
            "[MOCK-SARVAM] TranslateFromEnglish called (locale={Locale}, textLen={Len}). " +
            "Returning English text (no Sarvam key configured).", targetLocale, englishText.Length);
        return Task.FromResult(Result<string>.Success(englishText));
    }
}
