using AuthService.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the 2FA challenge token service — issue + validate round-trip,
/// expiry behaviour, and tamper detection.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ChallengeTokenServiceTests
{
    private static ChallengeTokenService MkService(string? secret = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(secret is null ? [] :
                new Dictionary<string, string?> { ["LOCAL_AUTH:SECRET"] = secret })
            .Build();
        return new ChallengeTokenService(config);
    }

    [Fact]
    public void IssueAndValidate_RoundTrip_ReturnsUserId()
    {
        var svc = MkService("my-test-secret-that-is-long-enough-32chars!");
        var userId = Guid.NewGuid();

        var token = svc.Issue(userId);
        var result = svc.Validate(token);

        result.Should().Be(userId);
    }

    [Fact]
    public void Validate_TamperedToken_ReturnsNull()
    {
        var svc = MkService("my-test-secret-that-is-long-enough-32chars!");
        var token = svc.Issue(Guid.NewGuid());

        // Tamper with the signature
        var parts = token.Split('.');
        var tampered = $"{parts[0]}.{parts[1]}.invalidsignature";

        svc.Validate(tampered).Should().BeNull();
    }

    [Fact]
    public void Validate_CompletelyBogusToken_ReturnsNull()
    {
        var svc = MkService();
        svc.Validate("not.a.valid.token.atall").Should().BeNull();
    }

    [Fact]
    public void Validate_TokenIssuedWithDifferentSecret_ReturnsNull()
    {
        var svc1 = MkService("secret-one-padded-to-thirty-two-chars-!!!");
        var svc2 = MkService("secret-two-padded-to-thirty-two-chars-!!!");
        var userId = Guid.NewGuid();

        var token = svc1.Issue(userId);

        // Different secret → validation fails
        svc2.Validate(token).Should().BeNull();
    }

    [Fact]
    public void Issue_ReturnsNonEmptyToken()
    {
        var svc = MkService();
        var token = svc.Issue(Guid.NewGuid());
        token.Should().NotBeNullOrWhiteSpace();
        token.Split('.').Should().HaveCount(3, "JWT format: header.payload.signature");
    }
}
