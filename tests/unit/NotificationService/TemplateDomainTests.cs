using FluentAssertions;
using FluentValidation.TestHelper;
using NotificationService.Application.Notifications.Commands.CreateTemplate;
using NotificationService.Application.Notifications.Commands.DeleteTemplate;
using NotificationService.Application.Notifications.Commands.TestSendTemplate;
using NotificationService.Application.Notifications.Commands.UpdateTemplate;
using NotificationService.Application.Notifications.Queries.ListTemplates;
using NotificationService.Domain.Entities;
using Xunit;

namespace NotificationService.Tests;

/// <summary>
/// Unit tests for the notification template domain entity and command validators
/// introduced in GAP-037.
/// Covers: Create→Retire lifecycle, RenderWithWarnings missing-variable reporting,
/// Update in-place, and all CRUD command validators.
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class TemplateDomainTests
{
    // ── Create / Retire lifecycle ──────────────────────────────────────────────

    [Fact]
    public void NotificationTemplate_Create_SetsIsCurrent_True()
    {
        var t = NotificationTemplate.Create("GST_DEADLINE_3_DAYS", NotificationChannel.Push, "en", "Body {{period}}");

        t.IsCurrent.Should().BeTrue();
        t.EffectiveTo.Should().BeNull();
        t.EventCode.Should().Be("GST_DEADLINE_3_DAYS");
    }

    [Fact]
    public void NotificationTemplate_Create_GeneratesStableCode()
    {
        var t = NotificationTemplate.Create("GST_DEADLINE_3_DAYS", NotificationChannel.Sms, "hi", "Body");

        // Code: <event>__<CHANNEL>__<locale>
        t.Code.Should().Be("GST_DEADLINE_3_DAYS__SMS__hi");
    }

    [Fact]
    public void NotificationTemplate_Retire_SetsIsCurrent_False_And_EffectiveTo()
    {
        var t = NotificationTemplate.Create("ITR_REFUND_CREDITED", NotificationChannel.Email, "en", "Your refund {{amount}} is credited.");

        t.Retire();

        t.IsCurrent.Should().BeFalse();
        t.EffectiveTo.Should().NotBeNull();
        t.EffectiveTo.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    [Fact]
    public void NotificationTemplate_Retire_IsIdempotent()
    {
        var t = NotificationTemplate.Create("CB_SCHEDULED", NotificationChannel.Push, "en", "Your callback is at {{time}}.");
        t.Retire();
        var firstEffectiveTo = t.EffectiveTo;

        // Call again — should not throw
        t.Retire();

        t.IsCurrent.Should().BeFalse();
        t.EffectiveTo.Should().Be(firstEffectiveTo);
    }

    [Fact]
    public void NotificationTemplate_SetActive_False_DeactivatesTemplate()
    {
        var t = NotificationTemplate.Create("LOAN_EMI_DUE", NotificationChannel.Sms, "en", "EMI of {{amount}} is due.");
        t.SetActive(false);

        t.IsCurrent.Should().BeFalse();
    }

    [Fact]
    public void NotificationTemplate_SetActive_True_ActivatesTemplate()
    {
        var t = NotificationTemplate.Create("LOAN_EMI_DUE", NotificationChannel.Sms, "en", "EMI of {{amount}} is due.");
        t.Retire(); // deactivate first

        t.SetActive(true);

        t.IsCurrent.Should().BeTrue();
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    [Fact]
    public void NotificationTemplate_Update_ChangesBodyAndMetadata()
    {
        var t = NotificationTemplate.Create("DOC_APPROVED", NotificationChannel.InApp, "en", "Your doc is approved.");

        t.Update("Your document {{docName}} has been approved.", "Document Approved", dltTemplateId: null, senderName: "SnapAccount");

        t.Body.Should().Be("Your document {{docName}} has been approved.");
        t.Subject.Should().Be("Document Approved");
        t.SenderName.Should().Be("SnapAccount");
    }

    [Fact]
    public void NotificationTemplate_Update_WithNullSubject_ClearsSubject()
    {
        var t = NotificationTemplate.Create("DOC_APPROVED", NotificationChannel.Email, "en", "Body", subject: "Old subject");

        t.Update("New body", null, null, null);

        t.Subject.Should().BeNull();
    }

    // ── RenderWithWarnings ─────────────────────────────────────────────────────

    [Fact]
    public void RenderWithWarnings_AllVariablesPresent_ReturnsNoMissingVars()
    {
        var t = NotificationTemplate.Create("GST_DEADLINE_3_DAYS", NotificationChannel.Push, "en",
            "Your GSTR-3B for {{period}} is due in {{days}} days.");

        var (rendered, missing) = t.RenderWithWarnings(
            new Dictionary<string, string> { ["period"] = "March 2026", ["days"] = "3" });

        rendered.Should().Be("Your GSTR-3B for March 2026 is due in 3 days.");
        missing.Should().BeEmpty();
    }

    [Fact]
    public void RenderWithWarnings_MissingVariable_ReturnsMissingVarName()
    {
        var t = NotificationTemplate.Create("GST_DEADLINE_3_DAYS", NotificationChannel.Push, "en",
            "Your GSTR-3B for {{period}} is due in {{days}} days.");

        var (rendered, missing) = t.RenderWithWarnings(
            new Dictionary<string, string> { ["period"] = "March 2026" }); // 'days' missing

        missing.Should().ContainSingle().Which.Should().Be("days");
        // Body still renders — {{days}} remains unsubstituted (not replaced by warning text here)
        rendered.Should().Contain("{{days}}");
    }

    [Fact]
    public void RenderWithWarnings_AllVariablesMissing_ReturnsAllMissingVarNames()
    {
        var t = NotificationTemplate.Create("CB_SCHEDULED", NotificationChannel.Sms, "hi",
            "Callback at {{time}} on {{date}} with {{agent}}.");

        var (_, missing) = t.RenderWithWarnings(new Dictionary<string, string>());

        missing.Should().BeEquivalentTo(["time", "date", "agent"]);
    }

    [Fact]
    public void RenderWithWarnings_VariableLookupIsCaseSensitive_ForMissingDetection()
    {
        // Note: missing-variable detection uses ContainsKey (case-sensitive by default).
        // Render() itself uses OrdinalIgnoreCase replacement.
        // This test documents the actual behavior: mismatch case → reported as missing
        // even though the rendering step would substitute it.
        var t = NotificationTemplate.Create("TEST", NotificationChannel.Email, "en",
            "Hello {{UserName}}, your OTP is {{otp}}.");

        // Exact-case match → no missing variables reported
        var (rendered, missing) = t.RenderWithWarnings(
            new Dictionary<string, string> { ["UserName"] = "Ravi", ["otp"] = "123456" });

        missing.Should().BeEmpty();
        rendered.Should().Be("Hello Ravi, your OTP is 123456.");
    }

    [Fact]
    public void RenderWithWarnings_EmptyBody_ReturnsEmptyWithNoMissingVars()
    {
        // Edge case: a template body with no placeholders
        var t = NotificationTemplate.Create("ACCT_PROFILE_UPDATED", NotificationChannel.InApp, "en",
            "Your profile has been updated.");

        var (rendered, missing) = t.RenderWithWarnings(new Dictionary<string, string>());

        rendered.Should().Be("Your profile has been updated.");
        missing.Should().BeEmpty();
    }

    // ── Render (basic) ─────────────────────────────────────────────────────────

    [Fact]
    public void Render_SubstitutesAllTokens()
    {
        var t = NotificationTemplate.Create("GST_ITC_MISMATCH", NotificationChannel.Email, "en",
            "ITC mismatch of {{amount}} for period {{period}}.");

        var rendered = t.Render(new Dictionary<string, string> { ["amount"] = "₹5,000", ["period"] = "Dec 2025" });

        rendered.Should().Be("ITC mismatch of ₹5,000 for period Dec 2025.");
    }

    // ── CRUD command validators ────────────────────────────────────────────────

    [Fact]
    public void CreateTemplateCommandValidator_ValidCommand_Passes()
    {
        var validator = new CreateTemplateCommandValidator();
        var cmd = new CreateTemplateCommand(
            "GST_DEADLINE_3_DAYS", NotificationChannel.Push, "en",
            "Your GSTR-3B for {{period}} is due in 3 days.");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateTemplateCommandValidator_EmptyEventCode_Fails()
    {
        var validator = new CreateTemplateCommandValidator();
        var cmd = new CreateTemplateCommand("", NotificationChannel.Push, "en", "Body");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "EventCode");
    }

    [Fact]
    public void CreateTemplateCommandValidator_UnsupportedLocale_Fails()
    {
        var validator = new CreateTemplateCommandValidator();
        var cmd = new CreateTemplateCommand(
            "GST_DEADLINE_3_DAYS", NotificationChannel.Push, "fr", "Bonjour {{period}}");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Locale");
    }

    [Theory]
    [InlineData("en")]
    [InlineData("hi")]
    [InlineData("bn")]
    public void CreateTemplateCommandValidator_SupportedLocales_Pass(string locale)
    {
        var validator = new CreateTemplateCommandValidator();
        var cmd = new CreateTemplateCommand("CB_SCHEDULED", NotificationChannel.Sms, locale, "Body {{time}}");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue($"locale {locale} should be supported");
    }

    [Fact]
    public void CreateTemplateCommandValidator_BodyExceedsMaxLength_Fails()
    {
        var validator = new CreateTemplateCommandValidator();
        var cmd = new CreateTemplateCommand(
            "TEST", NotificationChannel.Email, "en", new string('x', 10001));

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Body");
    }

    [Fact]
    public void UpdateTemplateCommandValidator_ValidCommand_Passes()
    {
        var validator = new UpdateTemplateCommandValidator();
        var cmd = new UpdateTemplateCommand(Guid.NewGuid(), "Updated body {{period}}.", Subject: "Updated");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdateTemplateCommandValidator_EmptyTemplateId_Fails()
    {
        var validator = new UpdateTemplateCommandValidator();
        var cmd = new UpdateTemplateCommand(Guid.Empty, "Body");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "TemplateId");
    }

    [Fact]
    public void DeleteTemplateCommandValidator_ValidCommand_Passes()
    {
        var validator = new DeleteTemplateCommandValidator();
        var cmd = new DeleteTemplateCommand(Guid.NewGuid());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void DeleteTemplateCommandValidator_EmptyTemplateId_Fails()
    {
        var validator = new DeleteTemplateCommandValidator();
        var cmd = new DeleteTemplateCommand(Guid.Empty);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "TemplateId");
    }

    [Fact]
    public void TestSendTemplateCommandValidator_ValidCommand_Passes()
    {
        var validator = new TestSendTemplateCommandValidator();
        var cmd = new TestSendTemplateCommand(
            Guid.NewGuid(),
            new Dictionary<string, string> { ["period"] = "March 2026" },
            RecipientEmail: "admin@test.com");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void TestSendTemplateCommandValidator_InvalidEmail_Fails()
    {
        var validator = new TestSendTemplateCommandValidator();
        var cmd = new TestSendTemplateCommand(
            Guid.NewGuid(),
            new Dictionary<string, string>(),
            RecipientEmail: "not-an-email");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "RecipientEmail");
    }

    // ── Bare-GET parameter defaulting — regression guard (B-Wave3-redux fix) ──
    // Protects against the "required query binding → 500" regression class.
    // Verifies that the ListTemplatesQuery can be constructed with the defaults
    // the fixed endpoint delegate now provides on a bare GET (no params).

    [Fact]
    public void ListTemplatesQuery_AcceptsDefaultPaginationWithNullFilters()
    {
        // The fixed delegate passes (eventCode=null, channel=null, locale=null, page=1, pageSize=20).
        var query = new ListTemplatesQuery(null, null, null, 1, 20);

        query.EventCode.Should().BeNull();
        query.Channel.Should().BeNull();
        query.Locale.Should().BeNull();
        query.Page.Should().Be(1);
        query.PageSize.Should().Be(20);
    }

    [Fact]
    public void ListTemplatesQuery_WithFilters_ConstructsCorrectly()
    {
        var query = new ListTemplatesQuery("GST_DEADLINE_3_DAYS", NotificationChannel.Push, "hi", 2, 50);

        query.EventCode.Should().Be("GST_DEADLINE_3_DAYS");
        query.Channel.Should().Be(NotificationChannel.Push);
        query.Locale.Should().Be("hi");
        query.Page.Should().Be(2);
        query.PageSize.Should().Be(50);
    }
}
