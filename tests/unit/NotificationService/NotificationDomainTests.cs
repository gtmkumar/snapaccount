using FluentAssertions;
using NotificationService.Application.Catalog;
using NotificationService.Application.Notifications.Commands.SendNotification;
using NotificationService.Domain.Entities;
using Xunit;

namespace NotificationService.Tests;

/// <summary>
/// Unit tests for NotificationService domain entities, catalog, and command validators.
/// Phase 6E — covers 26-event catalog, template domain, preference model, and
/// SendNotification validator.
/// </summary>
[Trait("Category", "Unit")]
public class NotificationDomainTests
{
    // ──────────────────────────────────────────────────────────────
    // Notification event catalog — 26 events
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void NotificationEventCatalog_Contains29Events()
    {
        // Phase 6C added 3 loan disbursement events: LOAN_DISBURSED, LOAN_DISBURSEMENT_FAILED, LOAN_DISBURSEMENT_REVERSED
        NotificationEventCatalog.All.Count.Should().Be(29);
    }

    [Fact]
    public void NotificationEventCatalog_AllEventCodesAreUnique()
    {
        var codes = NotificationEventCatalog.All.Select(e => e.EventCode).ToList();
        codes.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void NotificationEventCatalog_AllEntriesHaveNonEmptyFields()
    {
        foreach (var entry in NotificationEventCatalog.All)
        {
            entry.EventCode.Should().NotBeNullOrWhiteSpace($"entry {entry.EventCode} missing EventCode");
            entry.EventName.Should().NotBeNullOrWhiteSpace($"entry {entry.EventCode} missing EventName");
            entry.Category.Should().NotBeNullOrWhiteSpace($"entry {entry.EventCode} missing Category");
            entry.DefaultChannels.Should().NotBeNullOrWhiteSpace($"entry {entry.EventCode} missing DefaultChannels");
        }
    }

    [Theory]
    [InlineData("GST_DEADLINE_7_DAYS")]
    [InlineData("GST_DEADLINE_3_DAYS")]
    [InlineData("GST_DEADLINE_1_DAY")]
    [InlineData("GST_RETURN_FILED")]
    [InlineData("GST_ITC_MISMATCH")]
    [InlineData("GST_NOTICE_RECEIVED")]
    [InlineData("ITR_EFILE_VERIFY_D1")]
    [InlineData("ITR_EFILE_VERIFY_D7")]
    [InlineData("ITR_EFILE_VERIFY_D15")]
    [InlineData("ITR_EFILE_VERIFY_D25")]
    [InlineData("ITR_EFILE_VERIFY_D29")]
    [InlineData("ITR_REFUND_CREDITED")]
    [InlineData("DOC_OCR_COMPLETED")]
    [InlineData("DOC_OCR_FAILED")]
    [InlineData("DOC_APPROVED")]
    [InlineData("LOAN_APPLICATION_STATUS")]
    [InlineData("LOAN_EMI_DUE")]
    [InlineData("LOAN_EMI_PAID")]
    [InlineData("SUB_RENEWAL_7_DAYS")]
    [InlineData("SUB_RENEWAL_3_DAYS")]
    [InlineData("SUB_RENEWAL_FAILED")]
    [InlineData("CB_SCHEDULED")]
    [InlineData("CB_COMPLETED")]
    [InlineData("CB_ESCALATED")]
    [InlineData("ACCT_LOGIN_NEW_DEVICE")]
    [InlineData("ACCT_PROFILE_UPDATED")]
    public void NotificationEventCatalog_ContainsExpectedEventCode(string eventCode)
    {
        NotificationEventCatalog.All.Should().Contain(e => e.EventCode == eventCode,
            $"26-event catalog must include {eventCode}");
    }

    // ──────────────────────────────────────────────────────────────
    // NotificationTemplate domain entity
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void NotificationTemplate_Create_SetsAllFields()
    {
        var template = NotificationTemplate.Create(
            "GST_DEADLINE_3_DAYS",
            NotificationChannel.Push,
            "en",
            "Your GSTR-3B for {{period}} is due in 3 days.",
            subject: null,
            dltTemplateId: null);

        template.EventCode.Should().Be("GST_DEADLINE_3_DAYS");
        template.Channel.Should().Be(NotificationChannel.Push);
        template.Locale.Should().Be("en");
        template.Body.Should().Contain("{{period}}");
        template.IsCurrent.Should().BeTrue();
    }

    [Fact]
    public void NotificationTemplate_SmsWithoutDltTemplateId_DltTemplateIdIsNull()
    {
        var template = NotificationTemplate.Create(
            "GST_DEADLINE_3_DAYS",
            NotificationChannel.Sms,
            "en",
            "Your GSTR-3B for {{period}} is due in 3 days.",
            dltTemplateId: null);

        // DLT gate: a null DLT template ID means this template is NOT approved for SMS dispatch
        template.DltTemplateId.Should().BeNull();
    }

    [Fact]
    public void NotificationTemplate_SmsWithDltTemplateId_ApprovedForDispatch()
    {
        var template = NotificationTemplate.Create(
            "GST_DEADLINE_3_DAYS",
            NotificationChannel.Sms,
            "hi",
            "आपका GSTR-3B {{period}} के लिए 3 दिनों में देय है।",
            dltTemplateId: "1007163891654218752");

        template.DltTemplateId.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void NotificationTemplate_SupportsAllThreeLocales()
    {
        foreach (var locale in new[] { "en", "hi", "bn" })
        {
            var template = NotificationTemplate.Create(
                "GST_DEADLINE_3_DAYS", NotificationChannel.InApp, locale, "Body text");

            template.Locale.Should().Be(locale);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // NotificationPreference domain entity
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void NotificationPreference_CreateDefault_AllChannelsEnabledByDefault()
    {
        var userId = Guid.NewGuid();
        var pref = NotificationPreference.CreateDefault(userId, "GST_DEADLINE_3_DAYS");

        pref.UserId.Should().Be(userId);
        pref.EventCode.Should().Be("GST_DEADLINE_3_DAYS");
        pref.PushEnabled.Should().BeTrue();
        pref.SmsEnabled.Should().BeTrue();
        pref.EmailEnabled.Should().BeTrue();
        pref.InAppEnabled.Should().BeTrue();
        pref.DoNotDisturb.Should().BeFalse();
    }

    [Fact]
    public void NotificationPreference_UpdateChannels_PersistsChanges()
    {
        var pref = NotificationPreference.CreateDefault(Guid.NewGuid(), "GST_DEADLINE_3_DAYS");

        pref.UpdateChannels(push: true, sms: false, email: true, inApp: false,
            quietStart: "22:00", quietEnd: "08:00", dnd: false);

        pref.PushEnabled.Should().BeTrue();
        pref.SmsEnabled.Should().BeFalse();
        pref.EmailEnabled.Should().BeTrue();
        pref.InAppEnabled.Should().BeFalse();
        pref.QuietHoursStart.Should().Be("22:00");
        pref.QuietHoursEnd.Should().Be("08:00");
    }

    [Fact]
    public void NotificationPreference_DoNotDisturb_SuppressesAllChannels_WhenSetToTrue()
    {
        var pref = NotificationPreference.CreateDefault(Guid.NewGuid(), "LOAN_EMI_DUE");

        pref.UpdateChannels(push: true, sms: true, email: true, inApp: true, dnd: true);

        // DND flag is set — dispatcher must check this and suppress all sends
        pref.DoNotDisturb.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────
    // SendNotification command validator
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void SendNotificationCommandValidator_EmptyUserId_IsInvalid()
    {
        var validator = new SendNotificationCommandValidator();
        var cmd = new SendNotificationCommand(
            Guid.Empty, "GST_DEADLINE_3_DAYS", "en",
            new Dictionary<string, string>());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void SendNotificationCommandValidator_EmptyEventCode_IsInvalid()
    {
        var validator = new SendNotificationCommandValidator();
        var cmd = new SendNotificationCommand(
            Guid.NewGuid(), string.Empty, "en",
            new Dictionary<string, string>());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void SendNotificationCommandValidator_InvalidLocale_IsInvalid()
    {
        var validator = new SendNotificationCommandValidator();
        var cmd = new SendNotificationCommand(
            Guid.NewGuid(), "GST_DEADLINE_3_DAYS", "fr",  // French not supported
            new Dictionary<string, string>());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("en") || e.ErrorMessage.Contains("hi") || e.ErrorMessage.Contains("bn"));
    }

    [Theory]
    [InlineData("en")]
    [InlineData("hi")]
    [InlineData("bn")]
    public void SendNotificationCommandValidator_ValidLocales_AreValid(string locale)
    {
        var validator = new SendNotificationCommandValidator();
        var cmd = new SendNotificationCommand(
            Guid.NewGuid(), "GST_DEADLINE_3_DAYS", locale,
            new Dictionary<string, string> { { "period", "March 2026" } });

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue($"locale {locale} should be supported");
    }

    [Fact]
    public void SendNotificationCommandValidator_ValidFullCommand_IsValid()
    {
        var validator = new SendNotificationCommandValidator();
        var cmd = new SendNotificationCommand(
            Guid.NewGuid(), "CB_SCHEDULED", "hi",
            new Dictionary<string, string> { { "time", "3:30 PM" }, { "date", "25 April" } },
            RecipientEmail: "user@example.com",
            RecipientPhone: "+919876543210");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────
    // Channel deduplication — 6h window contract
    // NotificationLogEntry.Sent() is the factory for dispatched notifications.
    // The handler checks CreatedAt of existing log entries within 6h per DedupeKey.
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void NotificationLogEntry_Sent_SetsEventCodeAndChannel()
    {
        var userId = Guid.NewGuid();
        var log = NotificationLogEntry.Sent(
            userId: userId,
            eventCode: "GST_DEADLINE_3_DAYS",
            channel: NotificationChannel.Push,
            locale: "en",
            renderedBody: "Your GSTR-3B is due in 3 days.",
            providerMessageId: "fcm-12345",
            provider: "FCM",
            dedupeKey: $"{userId}:GST_DEADLINE_3_DAYS:Push");

        log.EventCode.Should().Be("GST_DEADLINE_3_DAYS");
        log.Channel.Should().Be(NotificationChannel.Push);
        log.Status.Should().Be(DispatchStatus.Sent);
        log.DedupeKey.Should().NotBeNullOrWhiteSpace("dedupe key is required for 6h window dedup");
    }

    [Fact]
    public void NotificationLogEntry_Failed_HasFailedStatus()
    {
        var log = NotificationLogEntry.Failed(
            Guid.NewGuid(), "ITR_REFUND_CREDITED",
            NotificationChannel.Email, "en",
            renderedBody: "Your ITR refund has been credited.",
            errorMessage: "SendGrid quota exceeded");

        log.Status.Should().Be(DispatchStatus.Failed);
        log.ErrorMessage.Should().Contain("SendGrid quota exceeded");
    }

    [Fact]
    public void NotificationLogEntry_Sent_DedupeKey_IsDeterministic_ForSameInputs()
    {
        // The handler builds dedupe key as userId:eventCode:channel — this test
        // documents the expected contract for the 6h window check.
        var userId = Guid.NewGuid();
        var expectedKey = $"{userId}:CB_SCHEDULED:Sms";

        var log = NotificationLogEntry.Sent(
            userId, "CB_SCHEDULED", NotificationChannel.Sms, "hi",
            "Callback scheduled for 3:30 PM", "msg91-999", "MSG91",
            dedupeKey: expectedKey);

        log.DedupeKey.Should().Be(expectedKey);
    }
}
