using FluentAssertions;
using GstService.Application.Interfaces;
using GstService.Application.NoticeDeadlineRules.Queries.ListDeadlineRules;
using GstService.Application.Notices.Commands.SetNoticeFormType;
using GstService.Application.Notices.Commands.UpdateAppealStage;
using GstService.Application.Notices.Queries.GetNoticeDeadline;
using GstService.Application.Notices.Queries.SimulateDrc;
using GstService.Domain.Entities;
using GstService.Domain.Enums;
using Moq;
using SnapAccount.Shared.Domain;

namespace GstService.Tests;

/// <summary>
/// Unit tests for GAP-108 GST notice automation depth:
///   — Form-type taxonomy domain logic
///   — Statutory deadline computation
///   — GSTAT appeal stage transitions
///   — DRC-01B/01C simulator validation
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstNoticeFormTypeTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    // ── Domain: FormType ─────────────────────────────────────────────────────

    [Fact]
    public void Create_DefaultFormType_IsOther()
    {
        var notice = GstNotice.Create(OrgId, "N-001", "DRC-01", Today);
        notice.FormType.Should().Be(GstNoticeFormType.OTHER);
    }

    [Fact]
    public void Create_WithFormType_SetsFormType()
    {
        var notice = GstNotice.Create(OrgId, "N-001", "DRC-01B", Today,
            formType: GstNoticeFormType.DRC_01B);
        notice.FormType.Should().Be(GstNoticeFormType.DRC_01B);
    }

    [Fact]
    public void SetFormType_UpdatesFormType()
    {
        var notice = GstNotice.Create(OrgId, "N-001", "ASMT-10", Today);
        notice.SetFormType(GstNoticeFormType.ASMT_10);
        notice.FormType.Should().Be(GstNoticeFormType.ASMT_10);
    }

    // ── Domain: Statutory Deadline ───────────────────────────────────────────

    [Fact]
    public void SetStatutoryDeadline_WhenNoOverride_SetsDueDate()
    {
        var notice = GstNotice.Create(OrgId, "N-002", "DRC-01C", Today);
        var deadline = Today.AddDays(7);
        notice.SetStatutoryDeadline(deadline);
        notice.StatutoryDeadline.Should().Be(deadline);
        notice.DueDate.Should().Be(deadline);
        notice.DeadlineOverridden.Should().BeFalse();
    }

    [Fact]
    public void OverrideDeadline_SetsOverriddenFlag_AndPreservesStatutory()
    {
        var notice = GstNotice.Create(OrgId, "N-003", "DRC-01B", Today);
        var statutory = Today.AddDays(7);
        var operatorDate = Today.AddDays(10);
        notice.SetStatutoryDeadline(statutory);
        notice.OverrideDeadline(operatorDate);
        notice.StatutoryDeadline.Should().Be(statutory);
        notice.DueDate.Should().Be(operatorDate);
        notice.DeadlineOverridden.Should().BeTrue();
    }

    [Fact]
    public void Create_WithExplicitDueDate_SetsDeadlineOverridden()
    {
        var explicitDate = Today.AddDays(15);
        var notice = GstNotice.Create(OrgId, "N-004", "ADT-01", Today, dueDate: explicitDate);
        notice.DeadlineOverridden.Should().BeTrue();
        notice.DueDate.Should().Be(explicitDate);
    }

    // ── Domain: GSTAT Appeal Stage ───────────────────────────────────────────

    [Fact]
    public void DefaultAppealStage_IsNone()
    {
        var notice = GstNotice.Create(OrgId, "N-005", "DRC-01", Today);
        notice.AppealStage.Should().Be(GstNoticeAppealStage.NONE);
    }

    [Fact]
    public void RecordOrderReceived_SetsStageAndDeadline()
    {
        var notice = GstNotice.Create(OrgId, "N-006", "DRC-01", Today);
        var orderDate = Today.AddDays(60);
        notice.RecordOrderReceived(orderDate, 90);
        notice.AppealStage.Should().Be(GstNoticeAppealStage.ORDER_RECEIVED);
        notice.AppealDeadline.Should().Be(orderDate.AddDays(90));
    }

    [Fact]
    public void RecordAppealFiled_SetsCorrectStage()
    {
        var notice = GstNotice.Create(OrgId, "N-007", "DRC-01", Today);
        notice.RecordOrderReceived(Today, 90);
        notice.RecordAppealFiled();
        notice.AppealStage.Should().Be(GstNoticeAppealStage.APPEAL_FILED);
    }

    [Fact]
    public void RecordGstatPending_SetsCorrectStage()
    {
        var notice = GstNotice.Create(OrgId, "N-008", "DRC-01", Today);
        notice.RecordOrderReceived(Today, 90);
        notice.RecordGstatPending();
        notice.AppealStage.Should().Be(GstNoticeAppealStage.GSTAT_PENDING);
    }

    [Fact]
    public void ResolveAppeal_ClosesNotice()
    {
        var notice = GstNotice.Create(OrgId, "N-009", "DRC-01", Today);
        notice.RecordOrderReceived(Today, 90);
        notice.ResolveAppeal();
        notice.AppealStage.Should().Be(GstNoticeAppealStage.RESOLVED);
        notice.Status.Should().Be("CLOSED");
    }

    [Fact]
    public void FileResponse_WhenAppealNone_PromotesToReplyFiled()
    {
        var notice = GstNotice.Create(OrgId, "N-010", "ASMT-10", Today);
        notice.FileResponse(Guid.NewGuid());
        notice.AppealStage.Should().Be(GstNoticeAppealStage.REPLY_FILED);
    }

    [Fact]
    public void SetGstatBacklogFlag_SetsFlag()
    {
        var notice = GstNotice.Create(OrgId, "N-011", "DRC-01", Today);
        notice.SetGstatBacklogFlag(true);
        notice.IsGstatBacklogFlagged.Should().BeTrue();
    }

    // ── IGstNoticeDeadlineService: static GetFinancialYear ──────────────────

    [Theory]
    [InlineData(4, 2025, "2025-26")]   // April = start of FY 2025-26
    [InlineData(3, 2026, "2025-26")]   // March = end of FY 2025-26
    [InlineData(1, 2026, "2025-26")]   // January = still FY 2025-26
    [InlineData(4, 2026, "2026-27")]   // April = start of FY 2026-27
    [InlineData(12, 2025, "2025-26")]  // December = mid FY 2025-26
    public void GetFinancialYear_ReturnsCorrectFy(int month, int year, string expectedFy)
    {
        var date = new DateOnly(year, month, 1);
        var fy = IGstNoticeDeadlineService.GetFinancialYear(date);
        fy.Should().Be(expectedFy);
    }

    // ── SimulateDrc validator ────────────────────────────────────────────────

    [Fact]
    public void SimulateDrcQuery_Drc01BValid_PassesValidation()
    {
        var query = new SimulateDrcQuery(OrgId, GstNoticeFormType.DRC_01B, "2025-26", 4);
        var validator = new SimulateDrcQueryValidator();
        var result = validator.Validate(query);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void SimulateDrcQuery_InvalidFormType_FailsValidation()
    {
        // ASMT_10 is not supported by the simulator (only DRC_01B/01C)
        var query = new SimulateDrcQuery(OrgId, GstNoticeFormType.ASMT_10, "2025-26", 4);
        var validator = new SimulateDrcQueryValidator();
        var result = validator.Validate(query);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "FormType");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    public void SimulateDrcQuery_InvalidMonth_FailsValidation(int month)
    {
        var query = new SimulateDrcQuery(OrgId, GstNoticeFormType.DRC_01B, "2025-26", month);
        var validator = new SimulateDrcQueryValidator();
        var result = validator.Validate(query);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void SimulateDrcQuery_InvalidFyFormat_FailsValidation()
    {
        var query = new SimulateDrcQuery(OrgId, GstNoticeFormType.DRC_01B, "FY2025-26", 4);
        var validator = new SimulateDrcQueryValidator();
        var result = validator.Validate(query);
        result.IsValid.Should().BeFalse();
    }

    // ── UpdateAppealStage validator ──────────────────────────────────────────

    [Fact]
    public void UpdateAppealStageCommand_OrderReceivedWithNoDate_FailsValidation()
    {
        var cmd = new UpdateAppealStageCommand(Guid.NewGuid(), GstNoticeAppealStage.ORDER_RECEIVED, null, null);
        var validator = new UpdateAppealStageCommandValidator();
        var result = validator.Validate(cmd);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "OrderDate");
    }

    [Fact]
    public void UpdateAppealStageCommand_OrderReceivedWithDate_Passes()
    {
        var cmd = new UpdateAppealStageCommand(Guid.NewGuid(), GstNoticeAppealStage.ORDER_RECEIVED, Today, null);
        var validator = new UpdateAppealStageCommandValidator();
        var result = validator.Validate(cmd);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdateAppealStageCommand_ZeroAppealWindowOverride_FailsValidation()
    {
        var cmd = new UpdateAppealStageCommand(Guid.NewGuid(), GstNoticeAppealStage.APPEAL_FILED, null, 0);
        var validator = new UpdateAppealStageCommandValidator();
        var result = validator.Validate(cmd);
        result.IsValid.Should().BeFalse();
    }

    // ── SetNoticeFormType validator ──────────────────────────────────────────

    [Fact]
    public void SetNoticeFormTypeCommand_ValidFormType_Passes()
    {
        var cmd = new SetNoticeFormTypeCommand(Guid.NewGuid(), GstNoticeFormType.DRC_01B, null);
        var validator = new SetNoticeFormTypeCommandValidator();
        validator.Validate(cmd).IsValid.Should().BeTrue();
    }

    [Fact]
    public void SetNoticeFormTypeCommand_EmptyNoticeId_FailsValidation()
    {
        var cmd = new SetNoticeFormTypeCommand(Guid.Empty, GstNoticeFormType.DRC_01B, null);
        var validator = new SetNoticeFormTypeCommandValidator();
        var result = validator.Validate(cmd);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "NoticeId");
    }

    // ── ListDeadlineRulesQuery ───────────────────────────────────────────────

    [Fact]
    public async Task ListDeadlineRulesQueryHandler_ReturnsMappedDtos()
    {
        // Arrange
        var rules = new[]
        {
            GstNoticeDeadlineRule.Create("2025-26", GstNoticeFormType.DRC_01B, 7, "Rule 88C"),
            GstNoticeDeadlineRule.Create("2025-26", GstNoticeFormType.DRC_01C, 7, "Rule 88D"),
        };

        var mockDeadlineService = new Mock<IGstNoticeDeadlineService>();
        mockDeadlineService
            .Setup(s => s.GetActiveRulesAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rules);

        var handler = new ListDeadlineRulesQueryHandler(mockDeadlineService.Object);

        // Act
        var result = await handler.Handle(new ListDeadlineRulesQuery("2025-26"), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);
        result.Value.Should().Contain(d => d.FormType == "DRC_01B" && d.ResponseWindowDays == 7);
        result.Value.Should().Contain(d => d.FormType == "DRC_01C" && d.ResponseWindowDays == 7);
    }
}
