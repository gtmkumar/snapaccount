using System.Text.RegularExpressions;
using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace AiService.Infrastructure.Services;

/// <summary>
/// Redacts PAN, Aadhaar, payment card numbers, and Indian mobile phone numbers from text
/// before LLM submission.
/// SEC-AI-01: Required on ALL paths that send user content to an AI provider.
///
/// Patterns (Indian PII):
/// <list type="bullet">
///   <item>PAN:     [A-Z]{5}[0-9]{4}[A-Z] (10 chars, all caps)</item>
///   <item>Aadhaar: 12 digits optionally grouped 4-4-4 with spaces/hyphens, preceded by an
///                  Aadhaar context keyword OR with the first digit in [2-9] (UIDAI spec) and
///                  no immediately adjacent digits/letters. Two patterns are combined:
///                  (a) keyword-prefixed, (b) standalone with first-digit constraint.</item>
///   <item>Card:    16 consecutive digits (with optional spaces/dashes every 4 digits)</item>
///   <item>Phone:   Indian mobile: [6-9]\d{9}, optionally prefixed +91/0/91 with optional
///                  space/hyphen separator. Backtracking-safe fixed quantifiers throughout.</item>
/// </list>
///
/// M-01 (SEC-AI-02): Fixes to Aadhaar pattern (reduces 12-digit false positives for invoice
/// numbers, bank accounts, etc.) and addition of phone number redaction.
/// </summary>
public sealed partial class TextRedactor(ILogger<TextRedactor> logger) : ITextRedactor
{
    // PAN: 5 uppercase letters, 4 digits, 1 uppercase letter.
    [GeneratedRegex(@"\b[A-Z]{5}[0-9]{4}[A-Z]\b", RegexOptions.Compiled)]
    private static partial Regex PanPattern();

    // Aadhaar — two sub-patterns ORed:
    //
    // (a) KEYWORD-PREFIXED: "Aadhaar", "UID", "UIDAI", "आधार" followed by optional
    //     colon/space and the 12-digit number in 4-4-4 grouping.
    //     This catches the vast majority of real Aadhaar appearances in OCR text.
    //
    // (b) STANDALONE first-digit constraint: first digit in [2-9] (UIDAI reserves 0/1),
    //     12 digits total, 4-4-4 grouping only when spaced/hyphenated (plain 12-digit
    //     standalone ONLY matches when space/hyphen separators are present — without them
    //     a bare 12-digit number could be an invoice number). Word-boundary anchors prevent
    //     matching within longer digit strings.
    //
    // Card redaction runs first, so a 16-digit number is already replaced before this
    // pattern runs. The \b anchor prevents partial matches within longer sequences.
    //
    // Backtracking safety: all quantifiers are fixed-width ({4}) with optional literal
    // separators ([\s-]? = at most 1 char). No *, + without bound — ReDoS-safe.
    //
    // M-01 note: "bare" 12-digit numbers without separators and without a keyword prefix
    // are NOT matched by pattern (b) to avoid false-positives on invoice/account numbers.
    // In practice, Aadhaar numbers in invoices/forms appear either with the keyword or
    // with space separators — this heuristic is sound for OCR text.
    [GeneratedRegex(
        @"(?:(?:Aadhaar|UID|UIDAI|आधार)\s*[:\-]?\s*)(\d{4}[\s-]?\d{4}[\s-]?\d{4})" +
        @"|(?<!\d)\b([2-9]\d{3}[\s-]\d{4}[\s-]\d{4}|[2-9]\d{3}-\d{4}-\d{4})\b(?!\d)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex AadhaarPattern();

    // Payment card: 16 digits optionally grouped with spaces/dashes every 4 digits.
    [GeneratedRegex(@"\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b", RegexOptions.Compiled)]
    private static partial Regex CardPattern();

    // Indian mobile phone numbers (M-01 SEC-AI-02):
    // Formats: +91 XXXXXXXXXX, 0XXXXXXXXXX, 91XXXXXXXXXX, plain XXXXXXXXXX
    // First digit of the 10-digit number must be 6-9 (Indian mobile range).
    // Optional prefix: +91, 0, 91 followed by optional space or hyphen.
    // Fixed quantifiers — backtracking-safe.
    [GeneratedRegex(
        @"\b(?:(?:\+91|0|91)[\s-]?)?[6-9]\d{9}\b",
        RegexOptions.Compiled)]
    private static partial Regex PhonePattern();

    /// <inheritdoc />
    public string Redact(string text)
    {
        if (string.IsNullOrEmpty(text))
            return text;

        var panCount = 0;
        var aadhaarCount = 0;
        var cardCount = 0;
        var phoneCount = 0;

        // Order matters:
        // 1. Card (16-digit) must run before Aadhaar (12-digit) to avoid partial-overlap matches.
        // 2. PAN (10 alpha-numeric) can run at any point — no overlap with digits-only patterns.
        // 3. Phone after PAN/Aadhaar/Card to avoid re-matching already-redacted placeholder text.
        var result = CardPattern().Replace(text, _ => { cardCount++; return "[REDACTED-CARD]"; });
        result = AadhaarPattern().Replace(result, _ => { aadhaarCount++; return "[REDACTED-AADHAAR]"; });
        result = PanPattern().Replace(result, _ => { panCount++; return "[REDACTED-PAN]"; });
        result = PhonePattern().Replace(result, _ => { phoneCount++; return "[REDACTED-PHONE]"; });

        if (panCount + aadhaarCount + cardCount + phoneCount > 0)
        {
            logger.LogInformation(
                "PII redacted before AI call: PAN={Pan}, Aadhaar={Aadhaar}, Card={Card}, Phone={Phone}.",
                panCount, aadhaarCount, cardCount, phoneCount);
        }

        return result;
    }
}
