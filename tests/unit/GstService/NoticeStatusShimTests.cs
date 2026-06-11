using FluentAssertions;
using GstService.Application.Notices.Queries.ListNotices;
using Xunit;

namespace GstService.Tests;

/// <summary>
/// Unit tests for the GST notice legacy status shim.
///
/// The shim lives at the endpoint layer (Gst.cs ListNotices delegate) so it cannot
/// be tested at the handler level directly. These tests verify:
/// 1. The ListNoticesQueryValidator accepts canonical values (no regression).
/// 2. The shim mapping logic (inline switch expression tested via pure logic).
/// 3. The validator rejects truly invalid values, confirming the shim is the only
///    path for legacy values.
///
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class NoticeStatusShimTests
{
    // ── Shim mapping logic — mirrors the endpoint switch expression ────────────

    /// <summary>
    /// Pure function that mirrors the shim logic in GstService.Api/Endpoints/Gst.cs.
    /// Kept in sync manually — if the endpoint shim changes, update this too.
    /// </summary>
    private static string? ApplyShim(string? status) => status switch
    {
        "Open"      => "RECEIVED",
        "Overdue"   => "UNDER_REVIEW",
        "Responded" => "RESPONDED",
        "Closed"    => "CLOSED",
        _           => status
    };

    [Theory]
    [InlineData("Open",      "RECEIVED")]
    [InlineData("Overdue",   "UNDER_REVIEW")]
    [InlineData("Responded", "RESPONDED")]
    [InlineData("Closed",    "CLOSED")]
    public void Shim_MapsLegacyValue_ToCanonical(string legacy, string expected)
    {
        var canonical = ApplyShim(legacy);
        canonical.Should().Be(expected,
            $"legacy value '{legacy}' must map to canonical '{expected}' for backward compat");
    }

    [Theory]
    [InlineData("RECEIVED")]
    [InlineData("UNDER_REVIEW")]
    [InlineData("RESPONDED")]
    [InlineData("CLOSED")]
    public void Shim_CanonicalValue_PassesThrough_Unchanged(string canonical)
    {
        var result = ApplyShim(canonical);
        result.Should().Be(canonical, "canonical values must not be altered by the shim");
    }

    [Fact]
    public void Shim_NullStatus_PassesThrough_Unchanged()
    {
        var result = ApplyShim(null);
        result.Should().BeNull("null (no filter) must pass through so all statuses are returned");
    }

    // ── ListNoticesQueryValidator — canonical values accepted ─────────────────

    [Theory]
    [InlineData("RECEIVED")]
    [InlineData("UNDER_REVIEW")]
    [InlineData("RESPONDED")]
    [InlineData("CLOSED")]
    public void Validator_AcceptsCanonicalStatus(string status)
    {
        var validator = new ListNoticesQueryValidator();
        var result = validator.Validate(new ListNoticesQuery(null, Status: status));
        result.IsValid.Should().BeTrue($"'{status}' is a valid canonical status value");
    }

    [Fact]
    public void Validator_AcceptsNullStatus()
    {
        var validator = new ListNoticesQueryValidator();
        var result = validator.Validate(new ListNoticesQuery(null, Status: null));
        result.IsValid.Should().BeTrue("null status (no filter) must be valid");
    }

    // ── ListNoticesQueryValidator — legacy values rejected (shim is the gateway) ─

    [Theory]
    [InlineData("Open")]
    [InlineData("Overdue")]
    public void Validator_RejectsLegacyStatus_ConfirmingShimIsRequired(string legacyStatus)
    {
        // Legacy values bypass the validator only because the shim converts them BEFORE
        // the query is constructed. This test confirms the validator itself would reject them.
        var validator = new ListNoticesQueryValidator();
        var result = validator.Validate(new ListNoticesQuery(null, Status: legacyStatus));
        result.IsValid.Should().BeFalse(
            $"'{legacyStatus}' is a legacy value rejected by the validator — the endpoint shim " +
            "must convert it to a canonical value before passing it to the query.");
    }

    [Fact]
    public void Validator_RejectsTrulyInvalidStatus()
    {
        var validator = new ListNoticesQueryValidator();
        var result = validator.Validate(new ListNoticesQuery(null, Status: "GARBAGE_VALUE_XYZ"));
        result.IsValid.Should().BeFalse("unknown status values must be rejected with 400");
    }

    // ── Shim completeness — all four legacy values are covered ────────────────

    [Fact]
    public void Shim_CoversAll_LegacyValues()
    {
        // Explicitly enumerate all legacy values from mobile/src/api/gst.ts GstNoticeStatus type
        // (pre-Wave-7C): Open, Responded, Closed, Overdue
        string[] legacyValues = ["Open", "Overdue", "Responded", "Closed"];
        string[] canonicalValues = ["RECEIVED", "UNDER_REVIEW", "RESPONDED", "CLOSED"];

        var validator = new ListNoticesQueryValidator();
        foreach (var legacy in legacyValues)
        {
            var mapped = ApplyShim(legacy);
            // Mapped value must be in the canonical set
            canonicalValues.Should().Contain(mapped,
                $"legacy value '{legacy}' → '{mapped}' must resolve to a canonical status");
            // And the canonical value must pass the validator
            var validResult = validator.Validate(new ListNoticesQuery(null, Status: mapped));
            validResult.IsValid.Should().BeTrue(
                $"shim output '{mapped}' (from '{legacy}') must pass validator");
        }
    }
}
