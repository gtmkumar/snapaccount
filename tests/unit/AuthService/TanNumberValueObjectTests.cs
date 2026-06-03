using FluentAssertions;
using SnapAccount.Shared.Domain.ValueObjects;
using Xunit;

namespace AuthService.Tests;

/// <summary>Unit tests for the TanNumber value object (AAAA99999A format).</summary>
[Trait("Category", "Unit")]
public sealed class TanNumberValueObjectTests
{
    [Theory]
    [InlineData("PNES03028F")]  // real TAN format
    [InlineData("ABCD12345E")]
    [InlineData("AAAA99999A")]
    public void Create_ValidTan_Succeeds(string tan)
    {
        var result = TanNumber.Create(tan);
        result.IsSuccess.Should().BeTrue($"'{tan}' is a valid TAN");
        result.Value.Value.Should().Be(tan.ToUpperInvariant());
    }

    [Theory]
    [InlineData("")]
    [InlineData("ABCD1234E")]    // 9 chars — too short
    [InlineData("ABCD123456E")] // 11 chars — too long
    [InlineData("1BCD12345E")]  // first char digit
    [InlineData("ABCD1234EF")]  // last two chars alpha (double alpha at end)
    [InlineData("ABCDE12345")]  // 5 alpha at start (PAN pattern, not TAN)
    public void Create_InvalidTan_Fails(string tan)
    {
        var result = TanNumber.Create(tan);
        result.IsFailure.Should().BeTrue($"'{tan}' is not a valid TAN");
    }

    [Fact]
    public void Create_NormalizesLowercase_ToUppercase()
    {
        var result = TanNumber.Create("pnes03028f");
        result.IsSuccess.Should().BeTrue();
        result.Value.Value.Should().Be("PNES03028F");
    }

    [Fact]
    public void Create_TrimsWhitespace()
    {
        var result = TanNumber.Create("  PNES03028F  ");
        result.IsSuccess.Should().BeTrue();
        result.Value.Value.Should().Be("PNES03028F");
    }

    [Fact]
    public void Equality_SameTan_AreEqual()
    {
        var t1 = TanNumber.Create("PNES03028F").Value;
        var t2 = TanNumber.Create("PNES03028F").Value;
        t1.Should().Be(t2);
    }

    [Fact]
    public void Equality_DifferentTan_AreNotEqual()
    {
        var t1 = TanNumber.Create("PNES03028F").Value;
        var t2 = TanNumber.Create("ABCD12345E").Value;
        t1.Should().NotBe(t2);
    }

    [Fact]
    public void ToString_ReturnsTanValue()
    {
        var t = TanNumber.Create("PNES03028F").Value;
        t.ToString().Should().Be("PNES03028F");
    }
}
