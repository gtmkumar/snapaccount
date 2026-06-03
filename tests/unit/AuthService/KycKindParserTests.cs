using AuthService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AuthService.Tests;

/// <summary>Unit tests for <see cref="KycKind.Parse"/> and the extended KycStatus constants.</summary>
[Trait("Category", "Unit")]
public sealed class KycKindParserTests
{
    [Theory]
    [InlineData("pan",     "PAN")]
    [InlineData("PAN",     "PAN")]
    [InlineData("Pan",     "PAN")]
    [InlineData("aadhaar", "AADHAAR")]
    [InlineData("AADHAAR", "AADHAAR")]
    [InlineData("gstin",   "GSTIN")]
    [InlineData("GSTIN",   "GSTIN")]
    [InlineData("tan",     "TAN")]
    [InlineData("TAN",     "TAN")]
    public void Parse_ValidKind_ReturnsCanonical(string input, string expected)
    {
        KycKind.Parse(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("")]
    [InlineData("unknown")]
    [InlineData("kyc")]
    [InlineData("gst")]
    public void Parse_UnknownKind_ReturnsNull(string input)
    {
        KycKind.Parse(input).Should().BeNull();
    }

    [Fact]
    public void AllSet_ContainsAllFourKinds()
    {
        KycKind.All.Should().Contain(KycKind.Pan);
        KycKind.All.Should().Contain(KycKind.Aadhaar);
        KycKind.All.Should().Contain(KycKind.Gstin);
        KycKind.All.Should().Contain(KycKind.Tan);
        KycKind.All.Should().HaveCount(4);
    }

    [Fact]
    public void KycStatus_ContainsSavedPendingVerifiedFailed()
    {
        KycStatus.Saved.Should().Be("SAVED");
        KycStatus.Pending.Should().Be("PENDING");
        KycStatus.Verified.Should().Be("VERIFIED");
        KycStatus.Failed.Should().Be("FAILED");
    }
}
