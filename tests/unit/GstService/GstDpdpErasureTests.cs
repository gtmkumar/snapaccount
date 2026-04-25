using FluentAssertions;
using GstService.Domain.Entities;

namespace GstService.Tests;

/// <summary>
/// SEC-040: Unit tests for DPDP erasure domain methods in GstService.
/// These tests verify the domain-level behaviour that the AccountDeletionSubscriber calls
/// during erasure processing. Each test corresponds to a step in the subscriber's
/// <c>EraseUserDataAsync</c> method.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstDpdpErasureTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    // ── GstNotice.AnonymizeRespondent ─────────────────────────────────────────

    [Fact]
    public void GstNotice_AnonymizeRespondent_ClearsRespondedBy()
    {
        // Arrange — notice with a respondent
        var notice = GstNotice.Create(
            Guid.NewGuid(), "ASMT-2025-001", "ASMT-10", Today, null, "Test");
        var responderId = Guid.NewGuid();
        notice.MarkUnderReview("[]");
        notice.FileResponse(responderId, null);
        notice.RespondedBy.Should().Be(responderId);

        // Act — DPDP erasure anonymizes the respondent reference
        notice.AnonymizeRespondent();

        // Assert — respondent reference cleared; notice status and other fields retained
        notice.RespondedBy.Should().BeNull("DPDP erasure must clear the user reference");
        notice.Status.Should().Be("RESPONDED", "notice status must be retained for org audit trail");
        notice.RespondedAt.Should().NotBeNull("response timestamp retained for audit");
    }

    [Fact]
    public void GstNotice_AnonymizeRespondent_OnUnrespondedNotice_IsIdempotent()
    {
        var notice = GstNotice.Create(
            Guid.NewGuid(), "ASMT-2025-002", "DRC-01", Today);
        notice.RespondedBy.Should().BeNull();

        // Should not throw even if respondent is already null
        var act = () => notice.AnonymizeRespondent();
        act.Should().NotThrow();
        notice.RespondedBy.Should().BeNull();
    }

    // ── Soft-delete via DeletedAt ──────────────────────────────────────────────

    [Fact]
    public void GstInvoice_SoftDelete_SetsDeletedAt()
    {
        // Verifies that directly setting DeletedAt (as the subscriber does) works
        var invoice = GstInvoice.Create(
            Guid.NewGuid(), "B2B", "INV-001", Today,
            "27AAAPZ0193A1ZX", "Supplier Ltd", 100000m, 0m, 9000m, 9000m, 0m);

        invoice.DeletedAt.Should().BeNull();

        var now = DateTime.UtcNow;
        invoice.DeletedAt = now;

        invoice.DeletedAt.Should().Be(now);
    }

    [Fact]
    public void GstNotice_SoftDelete_SetsDeletedAt()
    {
        var notice = GstNotice.Create(
            Guid.NewGuid(), "ASMT-2025-003", "ASMT-10", Today);

        var now = DateTime.UtcNow;
        notice.DeletedAt = now;

        notice.DeletedAt.Should().Be(now);
    }
}
