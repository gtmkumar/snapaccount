using AuthService.Application.Interfaces;
using AuthService.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for device integrity verifier implementations — GAP-064.
/// Covers mock verifier behaviour, sentinel tokens, and credential-gated stubs.
/// </summary>
public sealed class DeviceIntegrityVerifierTests
{
    // ─────────────────────────────────────────────────────────────────────────
    // MockDeviceIntegrityVerifier
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Mock_NormalToken_ReturnsPass()
    {
        var verifier = new MockDeviceIntegrityVerifier(NullLogger<MockDeviceIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync("some-valid-token", "ANDROID");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Pass);
        result.Reason.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Mock_SentinelFailToken_ReturnsFail()
    {
        var verifier = new MockDeviceIntegrityVerifier(NullLogger<MockDeviceIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync("mock-fail", "ANDROID");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Fail);
        result.Reason.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Mock_SentinelSkipToken_ReturnsSkipped()
    {
        var verifier = new MockDeviceIntegrityVerifier(NullLogger<MockDeviceIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync("mock-skip", "IOS");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Skipped);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Mock_EmptyOrWhitespaceToken_ReturnsSkipped(string token)
    {
        var verifier = new MockDeviceIntegrityVerifier(NullLogger<MockDeviceIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync(token, "ANDROID");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Skipped);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Mock_IosToken_ReturnsPass()
    {
        var verifier = new MockDeviceIntegrityVerifier(NullLogger<MockDeviceIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync("ios-attest-token-xyz", "IOS");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Pass);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PlayIntegrityVerifier — credential-gated stub
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public async Task PlayIntegrity_WithoutCredentials_ReturnsNotConfigured()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection([]).Build();
        var verifier = new PlayIntegrityVerifier(config, NullLogger<PlayIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync("android-token-xyz", "ANDROID");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.NotConfigured);
        result.Reason.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task PlayIntegrity_WithOnlyPartialCredentials_ReturnsNotConfigured()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DeviceIntegrity:PlayIntegrity:ServiceAccountJson"] = "{\"type\":\"service_account\"}"
                // PackageName deliberately omitted
            })
            .Build();

        var verifier = new PlayIntegrityVerifier(config, NullLogger<PlayIntegrityVerifier>.Instance);

        var result = await verifier.VerifyAsync("android-token-xyz", "ANDROID");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.NotConfigured);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AppAttestVerifier — credential-gated stub
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public async Task AppAttest_WithoutCredentials_ReturnsNotConfigured()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection([]).Build();
        var verifier = new AppAttestVerifier(config, NullLogger<AppAttestVerifier>.Instance);

        var result = await verifier.VerifyAsync("ios-attest-token-xyz", "IOS");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.NotConfigured);
        result.Reason.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task AppAttest_WithOnlyTeamId_ReturnsNotConfigured()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DeviceIntegrity:AppAttest:TeamId"] = "ABCDE12345"
                // BundleId deliberately omitted
            })
            .Build();

        var verifier = new AppAttestVerifier(config, NullLogger<AppAttestVerifier>.Instance);

        var result = await verifier.VerifyAsync("ios-attest-token-xyz", "IOS");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.NotConfigured);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DeviceIntegrityResult — value semantics
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityResult_PassWithNoReason_HasNullReason()
    {
        var result = new DeviceIntegrityResult(DeviceIntegrityVerdict.Pass);

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Pass);
        result.Reason.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityResult_FailWithReason_CarriesReason()
    {
        var result = new DeviceIntegrityResult(DeviceIntegrityVerdict.Fail, "Emulator detected");

        result.Verdict.Should().Be(DeviceIntegrityVerdict.Fail);
        result.Reason.Should().Be("Emulator detected");
    }
}
