using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Persistence;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace NotificationService.Tests;

/// <summary>
/// Regression tests for Wave 7 live-QA bugs BUG-W7-01 and BUG-W7-02.
///
/// BUG-W7-01: NotificationChannel enum did not deserialize from PascalCase string values
///            (e.g. {"channel":"Push"}) — JSON returned 500 instead of binding correctly.
///            Root cause: JsonStringEnumConverter was not registered in NotificationService
///            Program.cs ConfigureHttpJsonOptions.
///
/// BUG-W7-02: Template test-sends and celebrations write to notification_log without a parent
///            notification row. Originally notification_id was NOT NULL (migration 008) and
///            the EF shadow property had no default, causing a DB constraint violation → HTTP 500.
///            Resolution: migration 087 (applied 2026-06-12) made notification_id NULLABLE.
///            EF shadow property is now Guid? with no HasDefaultValue — EF writes NULL, which is
///            the correct domain value for test-send and celebration paths.
///            Two failure modes are guarded by tests here:
///              (a) INSERT: domain factory must not throw; EF must emit NULL for notification_id.
///              (b) READ: a row with NULL notification_id must materialise from EF without throwing
///                  (Guid? shadow property tolerates NULL; a Guid shadow property would throw).
/// </summary>
[Trait("Category", "Unit")]
public sealed class Wave7BugFixTests
{
    // ── BUG-W7-01: JsonStringEnumConverter — NotificationChannel ─────────────

    private static readonly JsonSerializerOptions JsonOptsWithStringEnum = new()
    {
        Converters = { new JsonStringEnumConverter() },
        PropertyNameCaseInsensitive = true
    };

    private static readonly JsonSerializerOptions JsonOptsDefault = new()
    {
        PropertyNameCaseInsensitive = true
    };

    [Theory]
    [InlineData("Push",    NotificationChannel.Push)]
    [InlineData("Sms",     NotificationChannel.Sms)]
    [InlineData("Email",   NotificationChannel.Email)]
    [InlineData("InApp",   NotificationChannel.InApp)]
    [InlineData("WhatsApp", NotificationChannel.WhatsApp)]
    public void NotificationChannel_PascalCaseString_DeserializesCorrectly_WhenConverterRegistered(
        string jsonValue, NotificationChannel expectedChannel)
    {
        // Arrange: simulate the JSON body that the frontend sends
        var json = $"{{\"channel\":\"{jsonValue}\"}}";

        // Act: deserialize using the same converter registered in Program.cs ConfigureHttpJsonOptions
        var result = JsonSerializer.Deserialize<ChannelWrapper>(json, JsonOptsWithStringEnum);

        // Assert
        result.Should().NotBeNull();
        result!.Channel.Should().Be(expectedChannel,
            $"PascalCase string '{jsonValue}' must deserialize to NotificationChannel.{expectedChannel}");
    }

    [Theory]
    [InlineData("Push")]
    [InlineData("Sms")]
    public void NotificationChannel_PascalCaseString_ThrowsOrReturnsDefault_WithoutConverter(
        string jsonValue)
    {
        // Documents the broken state before the fix: without JsonStringEnumConverter,
        // STJ treats PascalCase strings as invalid and throws JsonException.
        // With int enums ({"channel":0}) it works — that was the only working path before.
        var json = $"{{\"channel\":\"{jsonValue}\"}}";

        var act = () => JsonSerializer.Deserialize<ChannelWrapper>(json, JsonOptsDefault);

        // STJ throws JsonException for unrecognised string → 500 in Minimal API
        act.Should().Throw<JsonException>(
            "without JsonStringEnumConverter, PascalCase string enum values throw during binding");
    }

    [Theory]
    [InlineData(0, NotificationChannel.Push)]
    [InlineData(1, NotificationChannel.Sms)]
    [InlineData(2, NotificationChannel.Email)]
    [InlineData(3, NotificationChannel.InApp)]
    public void NotificationChannel_IntegerValue_AlwaysDeserializes(
        int intValue, NotificationChannel expectedChannel)
    {
        // Integer enum values work without the converter — this was the workaround before the fix.
        var json = $"{{\"channel\":{intValue}}}";

        var result = JsonSerializer.Deserialize<ChannelWrapper>(json, JsonOptsDefault);

        result.Should().NotBeNull();
        result!.Channel.Should().Be(expectedChannel);
    }

    [Fact]
    public void NotificationChannel_RoundTrip_StringEnum_SerializesAndDeserializes()
    {
        // Verify that serialization (response) also produces PascalCase strings, not integers.
        var wrapper = new ChannelWrapper(NotificationChannel.Push);
        var json = JsonSerializer.Serialize(wrapper, JsonOptsWithStringEnum);

        json.Should().Contain("\"Push\"",
            "responses must use PascalCase string values when JsonStringEnumConverter is registered");

        var roundTripped = JsonSerializer.Deserialize<ChannelWrapper>(json, JsonOptsWithStringEnum);
        roundTripped!.Channel.Should().Be(NotificationChannel.Push);
    }

    // ── BUG-W7-02: NotificationLogEntry — notification_id is now nullable (migration 087) ──

    // ── INSERT path: domain factory must produce valid entities without notification_id ──

    [Fact]
    public void NotificationLogEntry_Sent_CanBeCreated_WithoutNotificationId()
    {
        // Domain factory must not throw when notification_id is not set.
        // EF will write NULL for the Guid? shadow property — migration 087 permits NULL.
        var act = () => NotificationLogEntry.Sent(
            userId: Guid.NewGuid(),
            eventCode: "test.GST_DEADLINE_3_DAYS",
            channel: NotificationChannel.Push,
            locale: "en",
            renderedBody: "Your GSTR-3B is due in 3 days.",
            providerMessageId: "test",
            provider: "test-send");

        act.Should().NotThrow("NotificationLogEntry.Sent() must not throw when notification_id is absent");
    }

    [Fact]
    public void NotificationLogEntry_Sent_TestSend_HasCorrectProviderAndEventCode()
    {
        // TestSendTemplateCommandHandler uses provider="test-send" and eventCode="test.{original}".
        var entry = NotificationLogEntry.Sent(
            userId: Guid.NewGuid(),
            eventCode: "test.LOAN_APPLICATION_STATUS",
            channel: NotificationChannel.Email,
            locale: "en",
            renderedBody: "Your loan status: Approved.",
            providerMessageId: "test",
            provider: "test-send");

        entry.EventCode.Should().Be("test.LOAN_APPLICATION_STATUS");
        entry.Provider.Should().Be("test-send");
        entry.ProviderMessageId.Should().Be("test");
        entry.Status.Should().Be(DispatchStatus.Sent);
        entry.Channel.Should().Be(NotificationChannel.Email);
    }

    [Fact]
    public void NotificationLogEntry_CreateCelebration_CanBeCreated_WithoutNotificationId()
    {
        // CreateCelebration writes to notification_log without a parent notification row.
        // notification_id will be NULL in the DB — Guid? shadow property tolerates this.
        var act = () => NotificationLogEntry.CreateCelebration(
            Guid.NewGuid(), "celebration.first_gst_filing");

        act.Should().NotThrow();
    }

    [Fact]
    public void NotificationLogEntry_CreateCelebration_HasInAppChannelAndCelebrationProvider()
    {
        var entry = NotificationLogEntry.CreateCelebration(Guid.NewGuid(), "celebration.first_invoice");

        entry.Channel.Should().Be(NotificationChannel.InApp,
            "celebrations are always InApp — no schema change needed");
        entry.Provider.Should().Be("celebration");
        entry.Status.Should().Be(DispatchStatus.Sent);
    }

    // ── READ path: EF model must tolerate NULL notification_id on materialisation ──

    [Fact]
    public void NotificationLogEntryConfiguration_ShadowProperty_IsNullableGuid()
    {
        // Verify at the EF model level that NotificationId is mapped as Guid? (nullable).
        // A non-nullable Guid shadow property would throw InvalidOperationException when
        // EF attempts to materialise a row where notification_id IS NULL (all test-send
        // and celebration rows written after migration 087).
        // This test builds the EF model in-memory and inspects the CLR type of the property —
        // no database connection required.
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(NotificationLogEntry));

        entityType.Should().NotBeNull("NotificationLogEntry must be registered in the EF model");

        var shadowProp = entityType!.FindProperty("NotificationId");
        shadowProp.Should().NotBeNull("NotificationId shadow property must be declared in the configuration");
        shadowProp!.ClrType.Should().Be(typeof(Guid?),
            "notification_id is nullable (migration 087) — shadow property must be Guid? not Guid; " +
            "a non-nullable Guid would throw when EF materialises rows with NULL notification_id");
        shadowProp.IsNullable.Should().BeTrue(
            "IsNullable must be true so EF emits NULL on insert and reads NULL without throwing");
    }

    [Fact]
    public void NotificationLogEntryConfiguration_ShadowProperty_HasNoDefaultValue()
    {
        // EF HasDefaultValue causes EF to OMIT the column from INSERT when the value equals the
        // configured default — it does not write the sentinel. With a Guid? property and no default,
        // EF correctly writes NULL for unset shadow properties (the intended behaviour post-migration 087).
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(NotificationLogEntry))!;
        var shadowProp = entityType.FindProperty("NotificationId")!;

        // GetDefaultValue() returns null when no HasDefaultValue is configured.
        shadowProp.GetDefaultValue().Should().BeNull(
            "HasDefaultValue must NOT be set on NotificationId — see comment in " +
            "NotificationLogEntryConfiguration for the reason (EF omits-column vs writes-NULL)");
    }

    // ── BUG-W7-RETEST-01: notification_at is NOT NULL — mapped as real CLR property, no phantom default ──

    [Fact]
    public void NotificationLogEntryConfiguration_NotificationAt_IsMapped()
    {
        // notification.notification_log.notification_at is NOT NULL (migration 008, no DB default).
        // Fix: NotificationAt is a real DateTime property on NotificationLogEntry, set explicitly
        // in all factory methods (Sent/CreateCelebration/Failed) to DateTime.UtcNow.
        // This test verifies: the property is mapped to the correct column; it is required;
        // it has NO HasDefaultValueSql/HasDefaultValue (which would cause EF to omit the column
        // from INSERT → 23502 because there is no real DB default).
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(NotificationLogEntry));

        entityType.Should().NotBeNull("NotificationLogEntry must be registered in the EF model");

        var prop = entityType!.FindProperty(nameof(NotificationLogEntry.NotificationAt));
        prop.Should().NotBeNull(
            "NotificationAt must be a mapped property — notification_at is NOT NULL with no DB default; " +
            "without this mapping every INSERT raises 23502 not-null violation");

        prop!.GetColumnName().Should().Be("notification_at",
            "the property must be mapped to the notification_at column");

        prop!.ClrType.Should().Be(typeof(DateTime),
            "notification_at is TIMESTAMPTZ — the property must be DateTime");

        prop.IsNullable.Should().BeFalse(
            "notification_at is NOT NULL — IsNullable must be false");

        // MUST NOT have HasDefaultValueSql set.
        // HasDefaultValueSql causes EF to mark the property as ValueGeneratedOnAdd, which makes EF
        // omit the column from INSERT (EF defers to the server). Since there is no real DB default
        // on notification_at, Postgres raises 23502. The value is supplied explicitly by factory methods.
        // Note: GetDefaultValue() returns DateTime.MinValue for non-nullable DateTime (EF's CLR
        // type sentinel) even without HasDefaultValue() — do not assert on it, it is always non-null.
        prop.GetDefaultValueSql().Should().BeNull(
            "HasDefaultValueSql must NOT be set on NotificationAt: it causes EF to omit the column " +
            "from INSERT (ValueGeneratedOnAdd), but there is no real DB DEFAULT → 23502");
    }

    [Fact]
    public void NotificationLogEntry_Sent_SetsNotificationAt()
    {
        // Regression guard: all factory methods must set NotificationAt to a non-default DateTime.
        var before = DateTime.UtcNow;
        var entry = NotificationLogEntry.Sent(
            Guid.NewGuid(), "GST_DEADLINE_3_DAYS", NotificationChannel.Push,
            "en", "body", "msg123", "fcm");
        var after = DateTime.UtcNow;

        entry.NotificationAt.Should().BeOnOrAfter(before)
            .And.BeOnOrBefore(after,
            "NotificationAt must be set to DateTime.UtcNow by the Sent() factory so EF writes " +
            "a real value into notification_at (NOT NULL, no DB default)");
    }

    [Fact]
    public void NotificationLogEntry_Failed_SetsNotificationAt_AndNonNullProvider()
    {
        // Failed() previously left Provider null (mapped to NOT NULL provider column → 23502)
        // and left NotificationAt at DateTime.MinValue (also mapped to NOT NULL column → 23502).
        var entry = NotificationLogEntry.Failed(
            Guid.NewGuid(), "GST_DEADLINE_3_DAYS", NotificationChannel.Sms,
            "en", "body", "timeout");

        entry.NotificationAt.Should().NotBe(default(DateTime),
            "Failed() must set NotificationAt to DateTime.UtcNow — notification_at is NOT NULL");

        entry.Provider.Should().NotBeNullOrEmpty(
            "Failed() must set Provider to 'unknown' — provider column is NOT NULL with no DB default; " +
            "null Provider would cause 23502 on INSERT");

        entry.Provider.Should().Be("unknown");
    }

    [Fact]
    public void NotificationLogEntry_CreateCelebration_SetsNotificationAt()
    {
        var entry = NotificationLogEntry.CreateCelebration(Guid.NewGuid(), "celebration.first_invoice");

        entry.NotificationAt.Should().NotBe(default(DateTime),
            "CreateCelebration() must set NotificationAt — notification_at is NOT NULL");

        entry.Provider.Should().Be("celebration",
            "CreateCelebration() must set Provider to 'celebration'");
    }

    [Fact]
    public void NotificationLogEntryConfiguration_Provider_IsMappedAsRequired()
    {
        // provider column is NOT NULL with no DB default. EF must mark it required so the model
        // does not attempt to omit it — and the domain entity's non-nullable string ensures EF
        // always writes a value. This test checks the EF model, not the domain.
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(NotificationLogEntry))!;
        var prop = entityType.FindProperty(nameof(NotificationLogEntry.Provider))!;

        prop.IsNullable.Should().BeFalse(
            "provider is NOT NULL in the DB — EF IsRequired() must be configured on Provider");

        prop.GetColumnName().Should().Be("provider");
    }

    // ── Helper: build EF model without a real DB connection ─────────────────────

    private static NotificationServiceDbContext BuildInMemoryContext()
    {
        // UseNpgsql required to get the full Npgsql-flavoured model (not a generic in-memory model).
        // We never open a connection here — we only inspect Model metadata.
        var opts = new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<NotificationServiceDbContext>()
            .UseNpgsql("Host=localhost;Database=fake;Username=fake;Password=fake",
                o => o.SetPostgresVersion(17, 0))
            .Options;
        return new NotificationServiceDbContext(opts);
    }

    // ── Helper record ──────────────────────────────────────────────────────────

    private sealed record ChannelWrapper(NotificationChannel Channel);
}
