namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Redacts sensitive Indian PII patterns from text before it is included in any
/// LLM prompt payload. Patterns covered:
/// <list type="bullet">
///   <item>PAN — XXXXX9999X (10 chars alphanumeric)</item>
///   <item>Aadhaar — 12-digit number (with optional spaces every 4 digits)</item>
///   <item>Payment card — 16-digit number (with optional spaces/dashes every 4 digits)</item>
/// </list>
/// SEC-AI-01: All user content must be redacted before reaching any AI provider.
/// Called in <c>ExtractFieldsCommandHandler</c> and <c>ChatQueryHandler</c>.
/// </summary>
public interface ITextRedactor
{
    /// <summary>
    /// Returns a copy of <paramref name="text"/> with sensitive patterns replaced by
    /// their placeholder equivalents (e.g. <c>[REDACTED-PAN]</c>).
    /// </summary>
    string Redact(string text);
}
