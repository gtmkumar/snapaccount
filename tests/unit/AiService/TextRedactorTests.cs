using AiService.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="TextRedactor"/> — PAN, Aadhaar, and card redaction.
/// SEC-AI-01: All user content must be redacted before reaching any AI provider.
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

    // ── Aadhaar ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Aadhaar: 1234 5678 9012", "[REDACTED-AADHAAR]")]
    [InlineData("123456789012", "[REDACTED-AADHAAR]")]
    [InlineData("Aadhaar no is 9876-5432-1098", "[REDACTED-AADHAAR]")]
    public void Redact_AadhaarNumber_IsRedacted(string input, string expectedPattern)
    {
        var result = _redactor.Redact(input);
        result.Should().Contain(expectedPattern);
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
        // GSTIN should NOT be redacted (it is a business identifier, not PII).
        const string input = "GSTIN 22AAAAA0000A1Z5";
        var result = _redactor.Redact(input);
        result.Should().Be(input);
    }
}
