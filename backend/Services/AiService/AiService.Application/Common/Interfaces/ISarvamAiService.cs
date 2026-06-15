using SnapAccount.Shared.Domain;

namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Abstraction over the Sarvam AI APIs (Indian-language NLP).
/// Used for Indic-language chat routing when the user's locale is a supported Indic locale
/// (e.g. hi, ta, te, kn, ml, mr, bn, gu, pa, or, as).
/// Wrapped behind an interface for testability — real implementation calls
/// <c>https://api.sarvam.ai</c>; mock returns translated English responses.
/// </summary>
public interface ISarvamAiService
{
    /// <summary>
    /// Translates <paramref name="text"/> from <paramref name="sourceLocale"/> to English
    /// so the main LLM can process it. Returns the English text.
    /// </summary>
    Task<Result<string>> TranslateToEnglishAsync(string text, string sourceLocale, CancellationToken ct = default);

    /// <summary>
    /// Translates <paramref name="englishText"/> from English to <paramref name="targetLocale"/>.
    /// Used to localise the LLM's English response back to the user's language.
    /// </summary>
    Task<Result<string>> TranslateFromEnglishAsync(string englishText, string targetLocale, CancellationToken ct = default);
}
