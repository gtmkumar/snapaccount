using FluentAssertions;
using ItrService.Application.Filings.Commands.CaApprove;
using ItrService.Application.Filings.Commands.CaReject;
using ItrService.Application.Filings.Commands.ComputeTax;
using ItrService.Application.Filings.Commands.MarkEVerified;
using ItrService.Application.Filings.Commands.MarkFiled;
using ItrService.Application.Filings.Commands.SubmitForCaReview;
using ItrService.Application.Filings.Queries.GetFiling;
using ItrService.Application.Filings.Queries.ListFilings;
using ItrService.Application.Services;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;

namespace ItrService.Tests;

/// <summary>
/// SEC-039: IDOR tests for ITR filing handlers.
/// Verifies that cross-org access returns NotFound (not Forbidden) to prevent existence leaks.
/// ListFilings cross-org returns empty list (not error).
/// </summary>
[Trait("Category", "Unit")]
public sealed class FilingIdorTests : IDisposable
{
    private readonly ItrServiceDbContext _db;
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _otherOrgId = Guid.NewGuid();
    private Guid _filingId;
    private Guid _assesseeId;

    public FilingIdorTests()
    {
        var opts = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ItrServiceDbContext(opts);

        // Seed an assessee owned by _orgId
        var assessee = Assessee.Create(
            userId: Guid.NewGuid().ToString(),
            panCipher: "ENCRYPTED_PAN",
            panLast4: "K123",
            fullName: "Test User",
            organizationId: _orgId);
        _db.Assessees.Add(assessee);
        _db.SaveChanges();
        _assesseeId = assessee.Id;

        // Seed a filing for that assessee
        var filing = Filing.Create(_assesseeId, "AY2025-26", "ITR-1", "NEW", Guid.NewGuid());
        _db.Filings.Add(filing);
        _db.SaveChanges();
        _filingId = filing.Id;
    }

    public void Dispose() => _db.Dispose();

    // ── GetFilingQuery ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetFiling_SameOrg_ReturnsDto()
    {
        var handler = new GetFilingQueryHandler(_db, MockUser(_orgId).Object);

        var result = await handler.Handle(new GetFilingQuery(_filingId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.AssesseeId.Should().Be(_assesseeId);
    }

    [Fact]
    public async Task GetFiling_DifferentOrg_ReturnsNotFound()
    {
        // SEC-039: attacker from another org fetches a filing they don't own
        var handler = new GetFilingQueryHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(new GetFilingQuery(_filingId), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── ListFilingsQuery ──────────────────────────────────────────────────────

    [Fact]
    public async Task ListFilings_SameOrg_ReturnsFiling()
    {
        var handler = new ListFilingsQueryHandler(_db, MockUser(_orgId).Object);

        var result = await handler.Handle(
            new ListFilingsQuery(_assesseeId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(1);
    }

    [Fact]
    public async Task ListFilings_DifferentOrg_ReturnsEmptyList()
    {
        // SEC-039: attacker queries another org's assessee filings — gets empty, not an error
        var handler = new ListFilingsQueryHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new ListFilingsQuery(_assesseeId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("returns empty list not error to avoid existence leak");
        result.Value.TotalCount.Should().Be(0);
        result.Value.Items.Should().BeEmpty();
    }

    // ── SubmitForCaReviewCommand ──────────────────────────────────────────────

    [Fact]
    public async Task SubmitForCaReview_DifferentOrg_ReturnsNotFound()
    {
        var handler = new SubmitForCaReviewCommandHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new SubmitForCaReviewCommand(_filingId), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── CaApproveCommand ──────────────────────────────────────────────────────

    [Fact]
    public async Task CaApprove_DifferentOrg_ReturnsNotFound()
    {
        var handler = new CaApproveCommandHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new CaApproveCommand(_filingId, Guid.NewGuid()), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── CaRejectCommand ───────────────────────────────────────────────────────

    [Fact]
    public async Task CaReject_DifferentOrg_ReturnsNotFound()
    {
        var handler = new CaRejectCommandHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new CaRejectCommand(_filingId, Guid.NewGuid(), "Rejected"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── MarkFiledCommand ──────────────────────────────────────────────────────

    [Fact]
    public async Task MarkFiled_DifferentOrg_ReturnsNotFound()
    {
        var handler = new MarkFiledCommandHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new MarkFiledCommand(_filingId, "ACK123456"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── MarkEVerifiedCommand ──────────────────────────────────────────────────

    [Fact]
    public async Task MarkEVerified_DifferentOrg_ReturnsNotFound()
    {
        var handler = new MarkEVerifiedCommandHandler(_db, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new MarkEVerifiedCommand(_filingId, "EVC"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── ComputeTaxCommand ─────────────────────────────────────────────────────

    [Fact]
    public async Task ComputeTax_DifferentOrg_ReturnsNotFound()
    {
        var engine = new Mock<ITaxComputationEngine>();
        var handler = new ComputeTaxCommandHandler(_db, engine.Object, MockUser(_otherOrgId).Object);

        var result = await handler.Handle(
            new ComputeTaxCommand(_filingId, 500000m, 0, 0, 0, 0, 150000m, 25000m, 0, 0, 0, 0),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("Filing.NotFound");
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private static Mock<ICurrentUser> MockUser(Guid orgId)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.OrganizationId).Returns(orgId);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        return mock;
    }
}
