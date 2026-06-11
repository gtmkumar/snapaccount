using AiService.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="TextRedactor"/> — PAN, Aadhaar, card, and phone redaction.
/// SEC-AI-01: All user content must be redacted before reaching any AI provider.
/// M-01 (SEC-AI-02): Aadhaar regex tightened (context-keyword + first-digit constraint) and
/// phone number redaction added.
/// </summary>
[Trait("Category", "Unit")]
public sealed class TextRedactorTests
{
    private readonly TextRedactor _redactor = new(NullLogger<TextRedactor>.Instance);

    // ── PAN ─────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("PAN is ABCDE1234F", "[REDACTED-PAN]")]
    [InlineData("My PAN: AAAPL1234C filed with IT dept", "[REDACTED-PAN]")]
    [InlineData("ZZZPP9999Z", "[REDACTED-PAN]")]
    public void Redact_PanNumber_IsRedacted(string input, string expectedPattern)
    {
        var result = _redactor.Redact(input);
        result.Should().Contain(expectedPattern);
        result.Should().NotMatchRegex(@"\b[A-Z]{5}[0-9]{4}[A-Z]\b");
    }

    [Fact]
    public void Redact_NoPan_NotModified()
    {
        const string input = "Invoice amount is 18000 rupees for GSTIN 27AABCU9603R1ZX";
        var result = _redactor.Redact(input);
        result.Should().Be(input);
    }

    // ── Aadhaar (M-01: context-keyword or separator-grouped with first-digit constraint) ──

    [Theory]
    [InlineData("Aadhaar: 1234 5678 9012", "[REDACTED-AADHAAR]")]
    [InlineData("Aadhaar 9876 5432 1098", "[REDACTED-AADHAAR]")]
    [InlineData("UID: 2345-6789-0123", "[REDACTED-AADHAAR]")]
    [InlineData("UIDAI 3456 7890 1234", "[REDACTED-AADHAAR]")]
    [InlineData("My Aadhaar number is 5678 9012 3456", "[REDACTED-AADHAAR]")]
    public void Redact_AadhaarWithKeyword_IsRedacted(string input, string expectedPattern)
    {
        var result = _redactor.Redact(input);
        result.Should().Contain(expectedPattern);
    }

    [Theory]
    [InlineData("ID: 2345 6789 0123", "[REDACTED-AADHAAR]")]   // separator-grouped, first digit 2–9
    [InlineData("No: 9876-5432-1098", "[REDACTED-AADHAAR]")]   // hyphen-separated, first digit 9
    public void Redact_AadhaarSeparatorGroupedFirstDigitValid_IsRedacted(string input, string expectedPattern)
    {
        var result = _redactor.Redact(input);
        result.Should().Contain(expectedPattern);
    }

    [Theory]
    [InlineData("INV-202600123456")]      // invoice number — 12 digits embedded in alphanum
    [InlineData("Account: 123456789012")] // M-01: bare 12-digit without separator or keyword — should NOT match
    public void Redact_BareOrAlphanumericEmbedded12Digits_NotRedactedAsAadhaar(string input)
    {
        // M-01 fix: bare 12-digit numbers without keyword prefix or space/hyphen separators
        // should NOT be spuriously redacted as Aadhaar.
        var result = _redactor.Redact(input);
        result.Should().NotContain("[REDACTED-AADHAAR]",
            because: "bare 12-digit numbers without keyword or separator context should not be over-redacted");
    }

    // ── Payment Card ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Card: 4111 1111 1111 1111", "[REDACTED-CARD]")]
    [InlineData("4111111111111111", "[REDACTED-CARD]")]
    [InlineData("Pay via 5555-5555-5555-4444", "[REDACTED-CARD]")]
    public void Redact_CardNumber_IsRedacted(string input, string expectedPattern)
    {
        var result = _redactor.Redact(input);
        result.Should().Contain(expectedPattern);
    }

    // ── Phone (M-01 SEC-AI-02 new) ───────────────────────────────────────────

    [Theory]
    [InlineData("Call us at +91 9876543210", "[REDACTED-PHONE]")]
    [InlineData("Mobile: 9876543210", "[REDACTED-PHONE]")]
    [InlineData("Contact: 08765432109", "[REDACTED-PHONE]")]
    [InlineData("Phone +91-8765432109", "[REDACTED-PHONE]")]
    [InlineData("919876543210", "[REDACTED-PHONE]")]           // 91-prefixed without +
    public void Redact_IndianMobilePhone_IsRedacted(string input, string expectedPattern)
    {
        var result = _redactor.Redact(input);
        result.Should().Contain(expectedPattern);
    }

    [Theory]
    [InlineData("1234567890")]    // starts with 1 — not a valid Indian mobile
    [InlineData("0000000000")]    // starts with 0 (landline prefix, not mobile)
    public void Redact_NonIndianMobilePhone_NotRedacted(string input)
    {
        var result = _redactor.Redact(input);
        result.Should().NotContain("[REDACTED-PHONE]",
            because: "Indian mobile numbers must start with 6-9; others are not redacted");
    }

    // ── Multi-pattern ────────────────────────────────────────────────────────

    [Fact]
    public void Redact_MultiplePatterns_AllRedacted()
    {
        const string input = "PAN ABCDE1234F, Aadhaar 1234 5678 9012, Card 4111 1111 1111 1111";
        var result = _redactor.Redact(input);
        result.Should().Contain("[REDACTED-PAN]");
        result.Should().Contain("[REDACTED-AADHAAR]");
        result.Should().Contain("[REDACTED-CARD]");
        result.Should().NotContain("ABCDE1234F");
    }

    [Fact]
    public void Redact_PanCardAadhaarPhone_AllFourRedacted()
    {
        const string input =
            "PAN ABCDE1234F, Aadhaar: 9876 5432 1098, Card 4111 1111 1111 1111, Mobile +91 9876543210";
        var result = _redactor.Redact(input);
        result.Should().Contain("[REDACTED-PAN]");
        result.Should().Contain("[REDACTED-AADHAAR]");
        result.Should().Contain("[REDACTED-CARD]");
        result.Should().Contain("[REDACTED-PHONE]");
    }

    // ── Edge cases ───────────────────────────────────────────────────────────

    [Fact]
    public void Redact_EmptyString_ReturnsEmpty()
    {
        var result = _redactor.Redact(string.Empty);
        result.Should().BeEmpty();
    }

    [Fact]
    public void Redact_NoPiiText_Unchanged()
    {
        const string input = "Invoice #INV-2026-001, vendor Acme, amount INR 18,000.";
        var result = _redactor.Redact(input);
        result.Should().Be(input);
    }

    [Fact]
    public void Redact_GstinNumber_NotRedacted()
    {
        // GSTIN should NOT be redacted (it is a business identifier, not personal PII).
        // The PAN embedded in a GSTIN (positions 3-12) IS redacted separately if it appears
        // standalone, but the GSTIN as a contiguous string is intentionally preserved.
        const string input = "GSTIN 22AAAAA0000A1Z5";
        var result = _redactor.Redact(input);
        result.Should().Be(input);
    }

    // ── ReDoS safety (INFO — no catastrophic backtracking) ───────────────────

    [Theory]
    [InlineData("1234 1234 1234 12x")]       // near-miss Aadhaar with trailing non-digit
    [InlineData("4111 1111 1111 111x")]      // near-miss card
    [InlineData("+91 987654321x")]           // near-miss phone
    public void Redact_NearMissPatterns_CompleteWithinReasonableTime(string input)
    {
        // This test verifies that near-miss patterns do not trigger catastrophic backtracking
        // (all regexes use fixed-width quantifiers and are [GeneratedRegex]-compiled).
        var sw = System.Diagnostics.Stopwatch.StartNew();
        _ = _redactor.Redact(input);
        sw.Stop();
        sw.ElapsedMilliseconds.Should().BeLessThan(100,
            because: "all regex patterns must complete in constant time regardless of near-miss inputs");
    }
}
