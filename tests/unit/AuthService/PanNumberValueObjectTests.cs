using FluentAssertions;
using SnapAccount.Shared.Domain.ValueObjects;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests for the PanNumber value object.
/// PAN format: XXXXX9999X (5 uppercase letters, 4 digits, 1 uppercase letter).
/// Ref: CLAUDE.md "PAN format: XXXXX9999X" and PanNumber.cs.
/// </summary>
public class PanNumberValueObjectTests
{
    // ──────────────────────────────────────────────────────────────
    // Valid PANs
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("ABCDE1234F")]
    [InlineData("AABCS1234A")]
    [InlineData("ZZZZZ9999Z")]
    public void Create_ValidPan_Succeeds(string pan)
    {
        var result = PanNumber.Create(pan);

        result.IsSuccess.Should().BeTrue($"'{pan}' is a valid PAN");
        result.Value.Value.Should().Be(pan.ToUpperInvariant());
    }

    [Fact]
    public void Create_LowercasePan_NormalisedAndSucceeds()
    {
        // Create normalises to uppercase internally.
        var result = PanNumber.Create("abcde1234f");

        result.IsSuccess.Should().BeTrue("PAN input should be normalised to uppercase before validation");
        result.Value.Value.Should().Be("ABCDE1234F");
    }

    // ──────────────────────────────────────────────────────────────
    // Invalid PANs
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("ABCD1234F",   "too short — 9 chars")]
    [InlineData("ABCDE12345F", "too long — 11 chars")]
    [InlineData("12345ABCDE",  "digits in letter positions")]
    [InlineData("ABCDE123FF",  "letter where digit expected")]
    [InlineData("",            "empty string")]
    public void Create_InvalidPan_Fails(string pan, string reason)
    {
        var result = PanNumber.Create(pan);

        result.IsFailure.Should().BeTrue($"'{pan}' is invalid because: {reason}");
        result.Error.Code.Should().Be("PanNumber.Invalid");
    }

    [Fact]
    public void Create_NullPan_Fails()
    {
        var result = PanNumber.Create(null!);

        result.IsFailure.Should().BeTrue("null PAN is invalid");
    }

    // ──────────────────────────────────────────────────────────────
    // Equality
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void PanNumber_EqualityByValue()
    {
        var a = PanNumber.Create("ABCDE1234F").Value;
        var b = PanNumber.Create("ABCDE1234F").Value;

        (a == b).Should().BeTrue("PAN value objects with same value must be equal");
    }
}
