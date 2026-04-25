using FluentAssertions;
using GstService.Domain.Entities;
using GstService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace GstService.Tests;

/// <summary>
/// Unit tests for GstNotice domain entity — state machine and business rules.
/// Phase 6B.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstNoticeDomainTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    private static GstNotice CreateNotice(DateOnly? dueDate = null)
        => GstNotice.Create(OrgId, "ASMT-2025-001", "ASMT-10", Today, dueDate, "Test notice");

    // ── Creation ────────────────────────────────────────────────────────────

    [Fact]
    public void Create_WithValidData_ReturnsReceivedStatus()
    {
        var notice = CreateNotice();
        notice.Status.Should().Be("RECEIVED");
        notice.OrganizationId.Should().Be(OrgId);
        notice.NoticeNumber.Should().Be("ASMT-2025-001");
    }

    [Fact]
    public void Create_WithDueDate_SetsDueDate()
    {
        var due = Today.AddDays(15);
        var notice = CreateNotice(due);
        notice.DueDate.Should().Be(due);
    }

    // ── State Machine ───────────────────────────────────────────────────────

    [Fact]
    public void MarkUnderReview_FromReceived_Succeeds()
    {
        var notice = CreateNotice();
        var attachmentJson = """[{"gcs_uri":"gs://bucket/notice.pdf","filename":"notice.pdf"}]""";
        notice.MarkUnderReview(attachmentJson);
        notice.Status.Should().Be("UNDER_REVIEW");
        notice.AttachmentsJson.Should().Be(attachmentJson);
    }

    [Fact]
    public void FileResponse_FromUnderReview_SetsRespondedStatus()
    {
        var notice = CreateNotice();
        notice.MarkUnderReview("[]");
        var userId = Guid.NewGuid();
        notice.FileResponse(userId, null);
        notice.Status.Should().Be("RESPONDED");
        notice.RespondedBy.Should().Be(userId);
        notice.RespondedAt.Should().NotBeNull();
    }

    [Fact]
    public void FileResponse_FromReceived_AllowsDirectTransition()
    {
        // Business rule: can respond from RECEIVED without explicit UNDER_REVIEW step
        var notice = CreateNotice();
        var userId = Guid.NewGuid();
        notice.FileResponse(userId, null);
        notice.Status.Should().Be("RESPONDED");
    }

    [Fact]
    public void FileResponse_WithAttachmentJson_StoresAttachments()
    {
        var notice = CreateNotice();
        notice.MarkUnderReview("[]");
        var attachmentJson = """[{"gcs_uri":"gs://bucket/file.pdf","filename":"reply.pdf"}]""";
        notice.FileResponse(Guid.NewGuid(), attachmentJson);
        notice.ResponseAttachmentsJson.Should().Be(attachmentJson);
    }

    // ── CA Assignment ────────────────────────────────────────────────────────

    [Fact]
    public void AssignToCa_SetsAssignedCaId()
    {
        var notice = CreateNotice();
        var caId = Guid.NewGuid();
        notice.AssignToCa(caId);
        notice.AssignedCaId.Should().Be(caId);
    }

    [Fact]
    public void AssignToCa_RaisesGstNoticeAssignedToCaEvent()
    {
        var notice = CreateNotice();
        var caId = Guid.NewGuid();
        notice.AssignToCa(caId);
        notice.DomainEvents.Should().ContainSingle(e => e is GstNoticeAssignedToCaEvent);
        var evt = (GstNoticeAssignedToCaEvent)notice.DomainEvents.Single(e => e is GstNoticeAssignedToCaEvent);
        evt.CaId.Should().Be(caId);
        evt.OrganizationId.Should().Be(OrgId);
    }

    [Fact]
    public void AssignToCa_MultipleTimes_UpdatesAssignedCa()
    {
        var notice = CreateNotice();
        var caId1 = Guid.NewGuid();
        var caId2 = Guid.NewGuid();
        notice.AssignToCa(caId1);
        notice.AssignToCa(caId2);
        notice.AssignedCaId.Should().Be(caId2);
    }

    // ── SetIssuedBy ──────────────────────────────────────────────────────────

    [Fact]
    public void SetIssuedBy_SetsAuthority()
    {
        var notice = CreateNotice();
        notice.SetIssuedBy("CGST Delhi");
        notice.IssuedBy.Should().Be("CGST Delhi");
    }

    // ── Attachments (P6-HANDOFF-14) ──────────────────────────────────────────

    [Fact]
    public void AttachmentsJson_NeverPrePopulated_OnCreate()
    {
        // P6-HANDOFF-14: attachments are never set by Create — must be set explicitly via MarkUnderReview
        var notice = CreateNotice();
        notice.SetIssuedBy("CGST");
        notice.AttachmentsJson.Should().BeNull();
    }
}
