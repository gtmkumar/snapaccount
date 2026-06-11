using FluentAssertions;
using GstService.Application.Notices.Queries.ListNotices;
using GstService.Domain.Entities;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;

namespace GstService.Tests;

/// <summary>
/// WEB-FIX: Tests for the optional organizationId on ListNoticesQuery.
/// When organizationId is absent the handler must default to ICurrentUser.OrganizationId.
/// When neither is present it must return a 400-style validation failure (not 500).
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstNoticeOptionalOrgTests : IDisposable
{
    private readonly GstDbContext _db;
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _otherOrgId = Guid.NewGuid();

    public GstNoticeOptionalOrgTests()
    {
        var opts = new DbContextOptionsBuilder<GstDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new GstDbContext(opts);

        // Seed two notices for _orgId
        _db.GstNotices.Add(GstNotice.Create(_orgId, "ASMT-001", "ASMT-10",
            DateOnly.FromDateTime(DateTime.UtcNow), null, "Notice 1"));
        _db.GstNotices.Add(GstNotice.Create(_orgId, "ASMT-002", "ASMT-10",
            DateOnly.FromDateTime(DateTime.UtcNow), null, "Notice 2"));

        // Seed one notice for _otherOrgId
        _db.GstNotices.Add(GstNotice.Create(_otherOrgId, "ASMT-003", "ASMT-10",
            DateOnly.FromDateTime(DateTime.UtcNow), null, "Notice 3"));

        _db.SaveChanges();
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task ListNotices_ExplicitOrgId_ReturnsNoticesForThatOrg()
    {
        // Arrange: caller is in _otherOrgId but passes _orgId explicitly (admin use-case)
        var currentUser = MockCurrentUser(_otherOrgId);
        var handler = new ListNoticesQueryHandler(_db, currentUser.Object);

        // Act: explicit orgId overrides caller's org
        var result = await handler.Handle(
            new ListNoticesQuery(_orgId, null, 1, 20),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.All(n => n.NoticeNumber.StartsWith("ASMT-00")).Should().BeTrue();
    }

    [Fact]
    public async Task ListNotices_NoOrgId_DefaultsToCallerOrg()
    {
        // Arrange: caller is in _orgId, no explicit organizationId
        var currentUser = MockCurrentUser(_orgId);
        var handler = new ListNoticesQueryHandler(_db, currentUser.Object);

        // Act: organizationId = null → should default to caller's org
        var result = await handler.Handle(
            new ListNoticesQuery(null, null, 1, 20),
            CancellationToken.None);

        // Assert: only _orgId's notices returned
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
    }

    [Fact]
    public async Task ListNotices_NoOrgIdNoCallerOrg_ReturnsValidationFailure()
    {
        // Arrange: caller has no org (not onboarded) and no explicit orgId
        var currentUser = new Mock<ICurrentUser>();
        currentUser.Setup(u => u.OrganizationId).Returns((Guid?)null);
        currentUser.Setup(u => u.IsAuthenticated).Returns(true);

        var handler = new ListNoticesQueryHandler(_db, currentUser.Object);

        // Act
        var result = await handler.Handle(
            new ListNoticesQuery(null, null, 1, 20),
            CancellationToken.None);

        // Assert: should fail with a validation error, NOT throw a NullReferenceException
        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("GstNotice.MissingOrg");
    }

    [Fact]
    public async Task ListNotices_StatusFilter_AppliedCorrectly()
    {
        // Arrange: seed a RESPONDED notice in _orgId
        var notice = GstNotice.Create(_orgId, "ASMT-004", "ASMT-10",
            DateOnly.FromDateTime(DateTime.UtcNow), null, "Responded notice");
        // Simulate status via domain method
        notice.FileResponse(Guid.NewGuid(), null);
        _db.GstNotices.Add(notice);
        _db.SaveChanges();

        var currentUser = MockCurrentUser(_orgId);
        var handler = new ListNoticesQueryHandler(_db, currentUser.Object);

        // Act: filter by RESPONDED
        var result = await handler.Handle(
            new ListNoticesQuery(null, "RESPONDED", 1, 20),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items.First().Status.Should().Be("RESPONDED");
    }

    private static Mock<ICurrentUser> MockCurrentUser(Guid orgId)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.OrganizationId).Returns(orgId);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        return mock;
    }
}
