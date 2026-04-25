using FluentAssertions;
using SnapAccount.Shared.Domain.ValueObjects;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests for the GstinNumber value object.
/// GSTIN: 15-character format — 2-digit state + 10-char PAN + entity num + Z + check digit.
/// Ref: CLAUDE.md "GSTIN: 15-character format" and GstinNumber.cs.
/// </summary>
public class GstinValueObjectTests
{
    // ──────────────────────────────────────────────────────────────
    // Valid GSTINs
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("29ABCDE1234F1Z5")]  // Karnataka
    [InlineData("27AABCS1234A1Z5")]  // Maharashtra
    [InlineData("07ZZZZZ9999Z1ZA")]  // Delhi
    public void Create_ValidGstin_Succeeds(string gstin)
    {
        var result = GstinNumber.Create(gstin);

        result.IsSuccess.Should().BeTrue($"'{gstin}' is a valid 15-char GSTIN");
        result.Value.Value.Should().Be(gstin.ToUpperInvariant());
    }

    [Fact]
    public void Create_LowercaseGstin_NormalisedAndSucceeds()
    {
        var result = GstinNumber.Create("29abcde1234f1z5");

        result.IsSuccess.Should().BeTrue("GSTIN input should be normalised to uppercase");
        result.Value.Value.Should().Be("29ABCDE1234F1Z5");
    }

    // ──────────────────────────────────────────────────────────────
    // Invalid GSTINs
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("29ABCDE1234F1Z",  "14 chars — too short")]
    [InlineData("29ABCDE1234F1Z56", "16 chars — too long")]
    [InlineData("",                "empty string")]
    [InlineData("INVALID_GSTIN__", "wrong format")]
    public void Create_InvalidGstin_Fails(string gstin, string reason)
    {
        var result = GstinNumber.Create(gstin);

        result.IsFailure.Should().BeTrue($"'{gstin}' is invalid because: {reason}");
        result.Error.Code.Should().Be("GstinNumber.Invalid");
    }

    [Fact]
    public void Create_NullGstin_Fails()
    {
        var result = GstinNumber.Create(null!);

        result.IsFailure.Should().BeTrue("null GSTIN is invalid");
    }

    // ──────────────────────────────────────────────────────────────
    // Helper methods
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void GetStateCode_ReturnsFirstTwoChars()
    {
        var gstin = GstinNumber.Create("29ABCDE1234F1Z5").Value;

        gstin.GetStateCode().Should().Be("29", "state code is always first 2 characters");
    }

    [Fact]
    public void GetPan_ReturnsChars3To12()
    {
        var gstin = GstinNumber.Create("29ABCDE1234F1Z5").Value;

        gstin.GetPan().Should().Be("ABCDE1234F", "PAN is embedded in GSTIN positions 3-12");
    }
}
