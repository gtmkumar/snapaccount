using FluentAssertions;
using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Infrastructure.Auth;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// B3 / GAP-005: Verifies the fail-fast behavior of SessionTokenSecret.ValidateOrThrow.
/// In non-Development environments, the method must throw when the session JWT secret
/// resolves to the well-known default (DefaultLocalSecret). In Development it must no-op.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SessionTokenSecretValidateTests
{
    private static IConfiguration EmptyConfig() =>
        new ConfigurationBuilder().Build();

    private static IConfiguration ConfigWith(string key, string value) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { [key] = value })
            .Build();

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("production")]
    [InlineData("STAGING")]
    public void ValidateOrThrow_InNonDevWithNoSecret_ThrowsInvalidOperation(string environment)
    {
        // The env variable must not be set for this test to be deterministic.
        // We use an empty config so nothing overrides the default.
        var config = EmptyConfig();

        var act = () => SessionTokenSecret.ValidateOrThrow(config, environment);

        act.Should().Throw<InvalidOperationException>()
           .WithMessage("*SESSION_JWT_SECRET is not configured*",
               "the error message must guide operators to the exact fix");
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("development")]
    [InlineData("DEVELOPMENT")]
    public void ValidateOrThrow_InDevelopment_DoesNotThrow(string environment)
    {
        var config = EmptyConfig();

        var act = () => SessionTokenSecret.ValidateOrThrow(config, environment);

        act.Should().NotThrow("Development environments must work with the default local secret");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void ValidateOrThrow_InNonDevWithProperSecretInConfig_DoesNotThrow(string environment)
    {
        // A real secret (not the default) is configured via Auth:SessionSecret
        var config = ConfigWith("Auth:SessionSecret", "a-real-production-secret-32-chars-min!!");

        var act = () => SessionTokenSecret.ValidateOrThrow(config, environment);

        act.Should().NotThrow("a properly configured secret should pass validation");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void ValidateOrThrow_InNonDevWithExplicitDefaultLocalSecret_ThrowsInvalidOperation(string environment)
    {
        // This is the adversarial case: someone explicitly configured DefaultLocalSecret
        // (perhaps copied from the repo) — it must still be rejected.
        var config = ConfigWith("Auth:SessionSecret", FirebaseAuthMiddleware.DefaultLocalSecret);

        var act = () => SessionTokenSecret.ValidateOrThrow(config, environment);

        act.Should().Throw<InvalidOperationException>(
            "using the well-known default secret in production is as dangerous as no secret at all");
    }

    [Fact]
    public void Resolve_WithNoConfiguration_ReturnsDefaultLocalSecret()
    {
        var secret = SessionTokenSecret.Resolve(EmptyConfig());
        secret.Should().Be(FirebaseAuthMiddleware.DefaultLocalSecret,
            "the fallback must always be DefaultLocalSecret when nothing is configured");
    }

    [Fact]
    public void Resolve_WithAuthSessionSecretConfigured_ReturnsConfiguredValue()
    {
        const string expected = "my-super-secure-secret-32-chars!!";
        var config = ConfigWith("Auth:SessionSecret", expected);

        var secret = SessionTokenSecret.Resolve(config);

        secret.Should().Be(expected);
    }
}
