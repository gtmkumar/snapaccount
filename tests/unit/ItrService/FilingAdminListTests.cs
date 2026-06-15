using FluentAssertions;
using ItrService.Application.Filings.Queries.ListFilings;
using ItrService.Application.Filings.Queries.GetFilingKpi;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;

namespace ItrService.Tests;

/// <summary>
/// WEB-FIX: Tests for ListFilingsQuery optional-assesseeId mode (admin org-wide listing)
/// and GetFilingKpiQuery (new endpoint, previously 404).
/// </summary>
[Trait("Category", "Unit")]
public sealed class FilingAdminListTests : IDisposable
{
    private readonly ItrServiceDbContext _db;
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _otherOrgId = Guid.NewGuid();
    private Guid _assesseeId1;
    private Guid _assesseeId2;

    public FilingAdminListTests()
    {
        var opts = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ItrServiceDbContext(opts);

        // Seed assessees for _orgId
        var assessee1 = Assessee.Create(Guid.NewGuid().ToString(), "ENC", "K123", "User One", "INDIVIDUAL", _orgId);
        var assessee2 = Assessee.Create(Guid.NewGuid().ToString(), "ENC", "K456", "User Two", "INDIVIDUAL", _orgId);
        // Assessee for another org
        var assesseeOther = Assessee.Create(Guid.NewGuid().ToString(), "ENC", "K789", "Other User", "INDIVIDUAL", _otherOrgId);

        _db.Assessees.AddRange(assessee1, assessee2, assesseeOther);
        _db.SaveChanges();
        _assesseeId1 = assessee1.Id;
        _assesseeId2 = assessee2.Id;

        // Seed filings
        _db.Filings.Add(Filing.Create(_assesseeId1, "AY2025-26", "ITR-1", "NEW")); // DRAFT
        var reviewFiling = Filing.Create(_assesseeId1, "AY2026-27", "ITR-1", "NEW");
        reviewFiling.UpdateIncomeHeads(500000m, 0m, 0m, 0m, 0m);
        _db.Filings.Add(reviewFiling);
        _db.Filings.Add(Filing.Create(_assesseeId2, "AY2026-27", "ITR-4", "OLD")); // DRAFT
        _db.Filings.Add(Filing.Create(assesseeOther.Id, "AY2026-27", "ITR-1", "NEW")); // other org
        _db.SaveChanges();
    }

    public void Dispose() => _db.Dispose();

    // ── ListFilings: assessee-scoped mode ─────────────────────────────────────

    [Fact]
    public async Task ListFilings_WithAssesseeId_ReturnsOnlyThatAssesseeFilings()
    {
        var currentUser = MockUser(_orgId);
        var handler = new ListFilingsQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new ListFilingsQuery(_assesseeId1, null, 1, 20, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.All(f => f.AssesseeId == _assesseeId1).Should().BeTrue();
    }

    [Fact]
    public async Task ListFilings_WithAssesseeId_CrossOrg_ReturnsEmpty()
    {
        // SEC-039: caller from _orgId cannot access _otherOrgId's assessee filings
        var currentUser = MockUser(_orgId);
        var otherAssesseeId = _db.Assessees
            .First(a => a.OrganizationId == _otherOrgId).Id;
        var handler = new ListFilingsQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new ListFilingsQuery(otherAssesseeId, null, 1, 20, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty("cross-org access returns empty list to prevent existence leaks");
    }

    // ── ListFilings: org-wide mode (no assesseeId) ────────────────────────────

    [Fact]
    public async Task ListFilings_NoAssesseeId_ReturnsAllOrgFilings()
    {
        var currentUser = MockUser(_orgId);
        var handler = new ListFilingsQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new ListFilingsQuery(null, null, 1, 20, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // 3 filings for _orgId (2 for assessee1 + 1 for assessee2), other org excluded
        result.Value.Items.Should().HaveCount(3);
    }

    [Fact]
    public async Task ListFilings_NoAssesseeId_StatusFilter_Applied()
    {
        var currentUser = MockUser(_orgId);
        var handler = new ListFilingsQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new ListFilingsQuery(null, "DRAFT", 1, 20, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(3, "all seeded filings are DRAFT");
        result.Value.Items.All(f => f.Status == "DRAFT").Should().BeTrue();
    }

    [Fact]
    public async Task ListFilings_NoAssesseeId_AssessmentYearFilter_Applied()
    {
        var currentUser = MockUser(_orgId);
        var handler = new ListFilingsQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new ListFilingsQuery(null, null, 1, 20, "AY2026-27"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // 2 filings for AY2026-27 (one per assessee)
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.All(f => f.AssessmentYear == "AY2026-27").Should().BeTrue();
    }

    [Fact]
    public async Task ListFilings_NoAssesseeId_NoOrg_ReturnsValidationFailure()
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.Setup(u => u.OrganizationId).Returns((Guid?)null);
        currentUser.Setup(u => u.IsAuthenticated).Returns(true);

        var handler = new ListFilingsQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new ListFilingsQuery(null, null, 1, 20, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("ITR.MissingOrg");
    }

    // ── GetFilingKpiQuery ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetFilingKpi_ReturnsOrgScopedCounts()
    {
        var currentUser = MockUser(_orgId);
        var handler = new GetFilingKpiQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(new GetFilingKpiQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // 3 filings total for _orgId (all DRAFT by default)
        result.Value.TotalFilingsAy.Should().Be(3);
        result.Value.AwaitingReview.Should().Be(0, "no UNDER_CA_REVIEW filings seeded");
        result.Value.SlaBreached.Should().Be(0);
    }

    [Fact]
    public async Task GetFilingKpi_AssessmentYearFilter_Scoped()
    {
        var currentUser = MockUser(_orgId);
        var handler = new GetFilingKpiQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(new GetFilingKpiQuery("AY2026-27"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalFilingsAy.Should().Be(2, "2 filings for AY2026-27 in org");
    }

    [Fact]
    public async Task GetFilingKpi_OtherOrg_ReturnsZeroNotCrossOrgData()
    {
        var currentUser = MockUser(_otherOrgId);
        var handler = new GetFilingKpiQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(new GetFilingKpiQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalFilingsAy.Should().Be(1, "only the other org's filing");
    }

    private static Mock<ICurrentUser> MockUser(Guid orgId)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.OrganizationId).Returns(orgId);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        return mock;
    }
}
