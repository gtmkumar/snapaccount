using System.Text.RegularExpressions;
using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace AiService.Infrastructure.Services;

/// <summary>
/// Redacts PAN, Aadhaar, and payment card numbers from text before LLM submission.
/// SEC-AI-01: Required on ALL paths that send user content to an AI provider.
///
/// Patterns (Indian PII):
/// <list type="bullet">
///   <item>PAN:     [A-Z]{5}[0-9]{4}[A-Z] (10 chars, all caps)</item>
///   <item>Aadhaar: 12 consecutive digits (with optional spaces every 4 digits)</item>
///   <item>Card:    16 consecutive digits (with optional spaces/dashes every 4 digits)</item>
/// </list>
/// </summary>
public sealed partial class TextRedactor(ILogger<TextRedactor> logger) : ITextRedactor
{
    // PAN: 5 uppercase letters, 4 digits, 1 uppercase letter.
    [GeneratedRegex(@"\b[A-Z]{5}[0-9]{4}[A-Z]\b", RegexOptions.Compiled)]
    private static partial Regex PanPattern();

    // Aadhaar: exactly 12 digits, optionally grouped with spaces every 4 digits.
    [GeneratedRegex(@"\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b", RegexOptions.Compiled)]
    private static partial Regex AadhaarPattern();

    // Payment card: 16 digits optionally grouped with spaces/dashes every 4 digits.
    [GeneratedRegex(@"\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b", RegexOptions.Compiled)]
    private static partial Regex CardPattern();

    /// <inheritdoc />
    public string Redact(string text)
    {
        if (string.IsNullOrEmpty(text))
            return text;

        var panCount = 0;
        var aadhaarCount = 0;
        var cardCount = 0;

        // Order matters: card (16-digit) must be redacted before Aadhaar (12-digit)
        // to avoid partial overlap matches.
        var result = CardPattern().Replace(text, _ => { cardCount++; return "[REDACTED-CARD]"; });
        result = AadhaarPattern().Replace(result, _ => { aadhaarCount++; return "[REDACTED-AADHAAR]"; });
        result = PanPattern().Replace(result, _ => { panCount++; return "[REDACTED-PAN]"; });

        if (panCount + aadhaarCount + cardCount > 0)
        {
            logger.LogInformation(
                "PII redacted before AI call: PAN={Pan}, Aadhaar={Aadhaar}, Card={Card}.",
                panCount, aadhaarCount, cardCount);
        }

        return result;
    }
}
