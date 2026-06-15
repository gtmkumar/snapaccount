using FluentAssertions;
using GstService.Domain.Enums;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace GstService.Tests;

/// <summary>
/// Regression tests for Wave 7 live-QA bug BUG-W7-03.
///
/// BUG-W7-03: GstNoticeFormType enum did not deserialize from UPPER_SNAKE string values
///            (e.g. {"formType":"DRC_01B"}) — JSON binding returned 500 instead of the
///            correct handler response (HTTP 200 on success, 422 on validation error).
///            Root cause: JsonStringEnumConverter was not registered in GstService
///            Program.cs ConfigureHttpJsonOptions.
///            Fix: builder.Services.ConfigureHttpJsonOptions(opts =>
///                     opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter()))
///            Note: GstNoticeAppealStage (used in UpdateAppealStageRequest) has the same
///            class of bug and is covered here too.
/// </summary>
[Trait("Category", "Unit")]
public sealed class Wave7BugFixTests
{
    private static readonly JsonSerializerOptions JsonOptsWithStringEnum = new()
    {
        Converters = { new JsonStringEnumConverter() },
        PropertyNameCaseInsensitive = true
    };

    private static readonly JsonSerializerOptions JsonOptsDefault = new()
    {
        PropertyNameCaseInsensitive = true
    };

    // ── BUG-W7-03: GstNoticeFormType — string deserialization ────────────────

    [Theory]
    [InlineData("ASMT_10",  GstNoticeFormType.ASMT_10)]
    [InlineData("DRC_01",   GstNoticeFormType.DRC_01)]
    [InlineData("DRC_01A",  GstNoticeFormType.DRC_01A)]
    [InlineData("DRC_01B",  GstNoticeFormType.DRC_01B)]
    [InlineData("DRC_01C",  GstNoticeFormType.DRC_01C)]
    [InlineData("ADT_01",   GstNoticeFormType.ADT_01)]
    [InlineData("OTHER",    GstNoticeFormType.OTHER)]
    public void GstNoticeFormType_UpperSnakeString_DeserializesCorrectly_WhenConverterRegistered(
        string jsonValue, GstNoticeFormType expectedFormType)
    {
        // Arrange: simulate the PATCH /gst/notices/{id}/form-type body the frontend sends
        var json = $"{{\"formType\":\"{jsonValue}\"}}";

        // Act: deserialize using the converter registered in Program.cs ConfigureHttpJsonOptions
        var result = JsonSerializer.Deserialize<FormTypeWrapper>(json, JsonOptsWithStringEnum);

        // Assert
        result.Should().NotBeNull();
        result!.FormType.Should().Be(expectedFormType,
            $"UPPER_SNAKE string '{jsonValue}' must deserialize to GstNoticeFormType.{expectedFormType}");
    }

    [Fact]
    public void GstNoticeFormType_DRC_01B_String_ThrowsWithoutConverter()
    {
        // Documents the broken state before the fix: without JsonStringEnumConverter,
        // "DRC_01B" throws JsonException → 500 in the Minimal API pipeline.
        var json = "{\"formType\":\"DRC_01B\"}";

        var act = () => JsonSerializer.Deserialize<FormTypeWrapper>(json, JsonOptsDefault);

        act.Should().Throw<JsonException>(
            "without JsonStringEnumConverter, UPPER_SNAKE string values throw during STJ binding");
    }

    [Theory]
    [InlineData(0, GstNoticeFormType.ASMT_10)]
    [InlineData(3, GstNoticeFormType.DRC_01B)]
    [InlineData(4, GstNoticeFormType.DRC_01C)]
    public void GstNoticeFormType_IntegerValue_AlwaysDeserializes(
        int intValue, GstNoticeFormType expectedFormType)
    {
        // Integer enum values always work — this was the only working path before the fix.
        // {"formType":3} worked; {"formType":"DRC_01B"} did not.
        var json = $"{{\"formType\":{intValue}}}";

        var result = JsonSerializer.Deserialize<FormTypeWrapper>(json, JsonOptsDefault);

        result!.FormType.Should().Be(expectedFormType,
            $"integer value {intValue} must map to {expectedFormType}");
    }

    [Fact]
    public void GstNoticeFormType_RoundTrip_StringEnum_SerializesAndDeserializes()
    {
        var wrapper = new FormTypeWrapper(GstNoticeFormType.DRC_01B);
        var json = JsonSerializer.Serialize(wrapper, JsonOptsWithStringEnum);

        json.Should().Contain("\"DRC_01B\"",
            "responses must use UPPER_SNAKE string values when JsonStringEnumConverter is registered");

        var roundTripped = JsonSerializer.Deserialize<FormTypeWrapper>(json, JsonOptsWithStringEnum);
        roundTripped!.FormType.Should().Be(GstNoticeFormType.DRC_01B);
    }

    // ── GstNoticeAppealStage — same class of bug ─────────────────────────────

    [Theory]
    [InlineData("NONE",           GstNoticeAppealStage.NONE)]
    [InlineData("REPLY_FILED",    GstNoticeAppealStage.REPLY_FILED)]
    [InlineData("ORDER_RECEIVED", GstNoticeAppealStage.ORDER_RECEIVED)]
    [InlineData("APPEAL_FILED",   GstNoticeAppealStage.APPEAL_FILED)]
    [InlineData("GSTAT_PENDING",  GstNoticeAppealStage.GSTAT_PENDING)]
    [InlineData("RESOLVED",       GstNoticeAppealStage.RESOLVED)]
    public void GstNoticeAppealStage_UpperSnakeString_DeserializesCorrectly_WhenConverterRegistered(
        string jsonValue, GstNoticeAppealStage expectedStage)
    {
        var json = $"{{\"newStage\":\"{jsonValue}\"}}";
        var result = JsonSerializer.Deserialize<AppealStageWrapper>(json, JsonOptsWithStringEnum);

        result.Should().NotBeNull();
        result!.NewStage.Should().Be(expectedStage,
            $"UPPER_SNAKE string '{jsonValue}' must deserialize to GstNoticeAppealStage.{expectedStage}");
    }

    [Fact]
    public void GstNoticeFormType_AllValues_HaveCorrectOrdinal()
    {
        // Pin the enum ordinals — any change breaks existing int-based callers (e.g. older mobile versions).
        ((int)GstNoticeFormType.ASMT_10).Should().Be(0);
        ((int)GstNoticeFormType.DRC_01).Should().Be(1);
        ((int)GstNoticeFormType.DRC_01A).Should().Be(2);
        ((int)GstNoticeFormType.DRC_01B).Should().Be(3);
        ((int)GstNoticeFormType.DRC_01C).Should().Be(4);
        ((int)GstNoticeFormType.ADT_01).Should().Be(5);
        ((int)GstNoticeFormType.OTHER).Should().Be(6);
    }

    // ── Helper records ────────────────────────────────────────────────────────

    private sealed record FormTypeWrapper(GstNoticeFormType FormType);
    private sealed record AppealStageWrapper(GstNoticeAppealStage NewStage);
}
