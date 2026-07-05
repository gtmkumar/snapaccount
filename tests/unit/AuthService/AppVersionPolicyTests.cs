using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AuthService.Application.Config.Queries.GetAppVersionPolicy;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for <see cref="GetAppVersionPolicyQueryHandler"/> — GAP-116 mobile
/// force-update / minimum-supported-version kill-switch.
/// </summary>
[Trait("Category", "Unit")]
public sealed class AppVersionPolicyTests
{
    private static GetAppVersionPolicyQueryHandler BuildHandler(
        IDictionary<string, string?>? config = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(config ?? new Dictionary<string, string?>())
            .Build();

        return new GetAppVersionPolicyQueryHandler(configuration);
    }

    private static IDictionary<string, string?> AndroidFloor(string minimum, string latest) =>
        new Dictionary<string, string?>
        {
            ["AppVersion:Android:MinimumSupported"] = minimum,
            ["AppVersion:Android:Latest"] = latest,
            ["AppVersion:Android:StoreUrl"] = "https://play.google.com/store/apps/details?id=in.snapaccount.app",
        };

    [Fact]
    public async Task Below_minimum_requires_update()
    {
        var handler = BuildHandler(AndroidFloor("2.0.0", "2.1.0"));

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery("android", "1.9.9"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Platform.Should().Be("android");
        result.Value.UpdateRequired.Should().BeTrue();
        result.Value.UpdateAvailable.Should().BeTrue();
        result.Value.MinimumSupportedVersion.Should().Be("2.0.0");
        result.Value.LatestVersion.Should().Be("2.1.0");
    }

    [Fact]
    public async Task At_minimum_but_below_latest_only_nudges()
    {
        var handler = BuildHandler(AndroidFloor("2.0.0", "2.1.0"));

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery("android", "2.0.0"), CancellationToken.None);

        result.Value.UpdateRequired.Should().BeFalse();
        result.Value.UpdateAvailable.Should().BeTrue();
    }

    [Fact]
    public async Task On_latest_neither_required_nor_available()
    {
        var handler = BuildHandler(AndroidFloor("2.0.0", "2.1.0"));

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery("android", "2.1.0"), CancellationToken.None);

        result.Value.UpdateRequired.Should().BeFalse();
        result.Value.UpdateAvailable.Should().BeFalse();
    }

    [Theory]
    [InlineData("v2.0.0")]
    [InlineData("2.1.0-beta.3")]
    [InlineData("2.0.0+build.7")]
    public async Task Newer_version_with_semver_decoration_never_blocks(string current)
    {
        var handler = BuildHandler(AndroidFloor("2.0.0", "2.1.0"));

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery("android", current), CancellationToken.None);

        result.Value.UpdateRequired.Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-version")]
    public async Task Missing_or_unparseable_current_version_fails_open(string? current)
    {
        var handler = BuildHandler(AndroidFloor("2.0.0", "2.1.0"));

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery("android", current), CancellationToken.None);

        result.Value.UpdateRequired.Should().BeFalse();
        result.Value.UpdateAvailable.Should().BeFalse();
    }

    [Fact]
    public async Task Absent_config_falls_back_to_defaults_and_never_blocks()
    {
        var handler = BuildHandler();

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery("ios", "1.0.0"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Platform.Should().Be("ios");
        result.Value.MinimumSupportedVersion.Should().Be("1.0.0");
        result.Value.UpdateRequired.Should().BeFalse();
        result.Value.StoreUrl.Should().Contain("apps.apple.com");
    }

    [Theory]
    [InlineData("IOS", "ios")]
    [InlineData("Android", "android")]
    [InlineData("unknown", "ios")]
    public async Task Platform_is_normalized(string input, string expected)
    {
        var handler = BuildHandler();

        var result = await handler.Handle(
            new GetAppVersionPolicyQuery(input, "1.0.0"), CancellationToken.None);

        result.Value.Platform.Should().Be(expected);
    }
}
