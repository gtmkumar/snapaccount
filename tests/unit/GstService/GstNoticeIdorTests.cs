using FluentAssertions;
using GstService.Application.Notices.Commands.AssignNoticeToCa;
using GstService.Application.Notices.Commands.RespondToNotice;
using GstService.Application.Notices.Queries.GetNotice;
using GstService.Domain.Entities;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;

namespace GstService.Tests;

/// <summary>
/// SEC-038: IDOR tests for GST notice handlers.
/// Verifies that cross-org access returns NotFound (not Forbidden) to prevent existence leaks.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstNoticeIdorTests : IDisposable
{
    private readonly GstDbContext _db;
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _otherOrgId = Guid.NewGuid();
    private readonly Guid _noticeId = Guid.NewGuid();

    public GstNoticeIdorTests()
    {
        var opts = new DbContextOptionsBuilder<GstDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new GstDbContext(opts);

        // Seed a notice owned by _orgId
        var notice = GstNotice.Create(
            _orgId, "ASMT-2025-001", "ASMT-10",
            DateOnly.FromDateTime(DateTime.UtcNow), null, "Test notice");

        // Force the Id using the base-entity setter (EF will track it)
        _db.GstNotices.Add(notice);
        _db.SaveChanges();
        _noticeId = notice.Id;
    }

    public void Dispose() => _db.Dispose();

    // ── GetNoticeQuery ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetNotice_SameOrg_ReturnsDto()
    {
        var currentUser = MockCurrentUser(_orgId);
        var handler = new GetNoticeQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(new GetNoticeQuery(_noticeId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.OrganizationId.Should().Be(_orgId);
    }

    [Fact]
    public async Task GetNotice_DifferentOrg_ReturnsNotFound()
    {
        // SEC-038: attacker from a different org queries a notice they don't own
        var currentUser = MockCurrentUser(_otherOrgId);
        var handler = new GetNoticeQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(new GetNoticeQuery(_noticeId), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("GstNotice.NotFound");
    }

    [Fact]
    public async Task GetNotice_NonExistentId_ReturnsNotFound()
    {
        var currentUser = MockCurrentUser(_orgId);
        var handler = new GetNoticeQueryHandler(_db, currentUser.Object);

        var result = await handler.Handle(new GetNoticeQuery(Guid.NewGuid()), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("GstNotice.NotFound");
    }

    // ── RespondToNoticeCommand ────────────────────────────────────────────────

    [Fact]
    public async Task RespondToNotice_SameOrg_Succeeds()
    {
        var currentUser = MockCurrentUser(_orgId);
        var handler = new RespondToNoticeCommandHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new RespondToNoticeCommand(_noticeId, Guid.NewGuid(), "Our response", null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task RespondToNotice_DifferentOrg_ReturnsNotFound()
    {
        // SEC-038: attacker from a different org attempts to respond to another org's notice
        var currentUser = MockCurrentUser(_otherOrgId);
        var handler = new RespondToNoticeCommandHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new RespondToNoticeCommand(_noticeId, Guid.NewGuid(), "Injected response", null),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("GstNotice.NotFound");
    }

    // ── AssignNoticeToCaCommand ───────────────────────────────────────────────

    [Fact]
    public async Task AssignNoticeToCa_SameOrg_Succeeds()
    {
        var currentUser = MockCurrentUser(_orgId);
        var handler = new AssignNoticeToCaCommandHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new AssignNoticeToCaCommand(_noticeId, Guid.NewGuid()),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task AssignNoticeToCa_DifferentOrg_ReturnsNotFound()
    {
        // SEC-038: attacker from a different org attempts to assign another org's notice
        var currentUser = MockCurrentUser(_otherOrgId);
        var handler = new AssignNoticeToCaCommandHandler(_db, currentUser.Object);

        var result = await handler.Handle(
            new AssignNoticeToCaCommand(_noticeId, Guid.NewGuid()),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().StartWith("GstNotice.NotFound");
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private static Mock<ICurrentUser> MockCurrentUser(Guid orgId)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.OrganizationId).Returns(orgId);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        return mock;
    }
}
