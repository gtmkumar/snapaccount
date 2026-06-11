using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the device integrity domain entity and verdict enum — GAP-064.
/// Middleware itself depends on HttpContext and EF — integration-tested; here we validate
/// the entity factory and the verifier contract independently.
/// </summary>
public sealed class DeviceIntegrityEntityTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityCheck_Record_SetsAllFields()
    {
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();

        var check = DeviceIntegrityCheck.Record(
            verdict: "PASS",
            endpoint: "/auth/otp/send",
            platform: "ANDROID",
            userId: userId,
            organizationId: orgId,
            failureReason: null,
            clientIp: "192.168.1.1");

        check.Id.Should().NotBeEmpty();
        check.Verdict.Should().Be("PASS");
        check.Endpoint.Should().Be("/auth/otp/send");
        check.Platform.Should().Be("ANDROID");
        check.UserId.Should().Be(userId);
        check.OrganizationId.Should().Be(orgId);
        check.FailureReason.Should().BeNull();
        check.ClientIp.Should().Be("192.168.1.1");
        check.RecordedAt.Should().BeCloseTo(DateTime.UtcNow, precision: TimeSpan.FromSeconds(5));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityCheck_Record_AnonymousOtpSend_HasNullUserId()
    {
        var check = DeviceIntegrityCheck.Record(
            verdict: "SKIPPED",
            endpoint: "/auth/otp/send",
            platform: null,
            userId: null,
            organizationId: null);

        check.UserId.Should().BeNull();
        check.OrganizationId.Should().BeNull();
        check.Platform.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityCheck_Record_Fail_HasReason()
    {
        var check = DeviceIntegrityCheck.Record(
            verdict: "FAIL",
            endpoint: "/auth/password/login",
            platform: "ANDROID",
            failureReason: "Emulator detected by Play Integrity");

        check.Verdict.Should().Be("FAIL");
        check.FailureReason.Should().Be("Emulator detected by Play Integrity");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityCheck_Record_EachCallGetsUniqueId()
    {
        var first = DeviceIntegrityCheck.Record("PASS", "/auth/otp/send", "IOS");
        var second = DeviceIntegrityCheck.Record("PASS", "/auth/otp/send", "IOS");

        first.Id.Should().NotBe(second.Id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Verdict enum — all values present (contract with mobile)
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void DeviceIntegrityVerdict_HasExpectedValues()
    {
        var values = Enum.GetValues<DeviceIntegrityVerdict>();

        values.Should().Contain(DeviceIntegrityVerdict.Pass);
        values.Should().Contain(DeviceIntegrityVerdict.Fail);
        values.Should().Contain(DeviceIntegrityVerdict.Skipped);
        values.Should().Contain(DeviceIntegrityVerdict.NotConfigured);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("PASS")]
    [InlineData("FAIL")]
    [InlineData("SKIPPED")]
    [InlineData("NOT_CONFIGURED")]
    public void VerdictStrings_MatchTelemetryConvention(string verdictString)
    {
        // The middleware writes verdict.ToString().ToUpperInvariant() → must match these strings
        // This test locks the wire format so mobile-dev / security-reviewer can rely on it
        var normalized = verdictString
            .Replace("_", "")
            .Replace(" ", "");
        var enumValues = Enum.GetValues<DeviceIntegrityVerdict>()
            .Select(v => v.ToString().ToUpperInvariant())
            .Select(v => v.Replace("_", ""))
            .ToList();

        enumValues.Should().Contain(normalized);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Policy matrix — soft-fail mode (Enforce=false) never blocks
    // ─────────────────────────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData(DeviceIntegrityVerdict.Pass, false, false, true)]
    [InlineData(DeviceIntegrityVerdict.Fail, false, false, true)]   // soft-fail: allow even on FAIL
    [InlineData(DeviceIntegrityVerdict.Fail, true, false, false)]   // enforce: block on FAIL
    [InlineData(DeviceIntegrityVerdict.Skipped, false, false, true)]
    [InlineData(DeviceIntegrityVerdict.Skipped, true, true, false)] // enforce+requireToken: block absent
    [InlineData(DeviceIntegrityVerdict.Skipped, true, false, true)] // enforce, no requireToken: allow
    [InlineData(DeviceIntegrityVerdict.NotConfigured, true, false, true)] // NotConfigured = treated as Skipped
    public void PolicyMatrix_AllowedResult_MatchesExpectation(
        DeviceIntegrityVerdict verdict,
        bool enforce,
        bool requireToken,
        bool expectedAllow)
    {
        // This replicates the allow/block decision logic from DeviceIntegrityMiddleware
        // as a pure function — keeps the business rule visible and testable without ASP.NET
        bool actualAllow = ShouldAllow(verdict, enforce, requireToken);
        actualAllow.Should().Be(expectedAllow,
            $"verdict={verdict} enforce={enforce} requireToken={requireToken}");
    }

    // Mirror of the middleware decision logic — must stay in sync with DeviceIntegrityMiddleware
    private static bool ShouldAllow(DeviceIntegrityVerdict verdict, bool enforce, bool requireToken)
    {
        if (verdict == DeviceIntegrityVerdict.Skipped || verdict == DeviceIntegrityVerdict.NotConfigured)
        {
            if (enforce && requireToken) return false; // block absent token in strict mode
            return true; // soft or no requirement
        }

        if (verdict == DeviceIntegrityVerdict.Fail)
        {
            return !enforce; // block only when enforce=true
        }

        return true; // Pass always allows
    }
}
