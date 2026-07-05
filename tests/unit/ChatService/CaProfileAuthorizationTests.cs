using ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;
using ChatService.Application.Appointments.Queries.GetMyCaProfile;
using ChatService.Application.Appointments.Queries.ListAvailabilityRules;
using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Authorization / IDOR regression tests for the CA-profile availability endpoints
/// (2026-07-05 access-control-matrix campaign, ACM-04 / ACM-10).
///
/// The security invariant under test: a non-super caller may only read or write
/// availability data for their OWN CA profile. Passing another CA's caProfileId must
/// be rejected with 403 (Forbidden), never silently honoured. SUPER_ADMIN (permission
/// "*") bypasses the ownership check by design (platform administration).
///
/// Uses EF Core InMemory + a Moq'd ICurrentUser — no real Postgres needed.
/// </summary>
[Trait("Category", "Unit")]
public sealed class CaProfileAuthorizationTests : IDisposable
{
    private readonly ChatService.Infrastructure.Persistence.ChatServiceDbContext _efContext;
    private readonly IChatServiceDbContext _db;
    private readonly Mock<ICurrentUser> _currentUser = new();

    private readonly Guid _callerUserId = Guid.NewGuid();
    private readonly Guid _otherUserId = Guid.NewGuid();

    public CaProfileAuthorizationTests()
    {
        var options = new DbContextOptionsBuilder<ChatService.Infrastructure.Persistence.ChatServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _efContext = new ChatService.Infrastructure.Persistence.ChatServiceDbContext(options);
        _db = _efContext;

        _currentUser.Setup(u => u.IsAuthenticated).Returns(true);
        _currentUser.Setup(u => u.UserId).Returns(_callerUserId);
        // Default: NOT super admin (unconfigured HasPermission returns false in Moq).
    }

    public void Dispose() => _efContext.Dispose();

    private async Task<CaProfile> SeedProfileAsync(Guid userId, string name)
    {
        var profile = CaProfile.Create(userId, name);
        _efContext.CaProfiles.Add(profile);
        await _efContext.SaveChangesAsync();
        return profile;
    }

    private void AsSuperAdmin() => _currentUser.Setup(u => u.HasPermission("*")).Returns(true);

    // ── ListAvailabilityRulesQuery ─────────────────────────────────────────────

    [Fact]
    public async Task ListRules_ForeignCaProfileId_NonSuper_IsForbidden()
    {
        var other = await SeedProfileAsync(_otherUserId, "CA Priya Sharma");
        var handler = new ListAvailabilityRulesQueryHandler(_db, _currentUser.Object);

        var result = await handler.Handle(new ListAvailabilityRulesQuery(other.Id, true), default);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Type.Should().Be(ErrorType.Forbidden);
        result.Error!.Code.Should().Be("CaProfile.NotOwner");
    }

    [Fact]
    public async Task ListRules_OwnCaProfileId_Succeeds()
    {
        var mine = await SeedProfileAsync(_callerUserId, "CA Me");
        var handler = new ListAvailabilityRulesQueryHandler(_db, _currentUser.Object);

        var result = await handler.Handle(new ListAvailabilityRulesQuery(mine.Id, true), default);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task ListRules_ForeignCaProfileId_SuperAdmin_Succeeds()
    {
        AsSuperAdmin();
        var other = await SeedProfileAsync(_otherUserId, "CA Priya Sharma");
        var handler = new ListAvailabilityRulesQueryHandler(_db, _currentUser.Object);

        var result = await handler.Handle(new ListAvailabilityRulesQuery(other.Id, true), default);

        result.IsSuccess.Should().BeTrue();
    }

    // ── GenerateSlotsFromRulesCommand ──────────────────────────────────────────

    [Fact]
    public async Task GenerateSlots_ForeignCaProfileId_NonSuper_IsForbidden_AndDoesNotGenerate()
    {
        var other = await SeedProfileAsync(_otherUserId, "CA Priya Sharma");
        var slotGen = new Mock<ISlotGenerationService>();
        var handler = new GenerateSlotsFromRulesCommandHandler(_db, _currentUser.Object, slotGen.Object);

        var result = await handler.Handle(new GenerateSlotsFromRulesCommand(other.Id, 1), default);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Type.Should().Be(ErrorType.Forbidden);
        result.Error!.Code.Should().Be("CaProfile.NotOwner");
        slotGen.Verify(s => s.GenerateAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GenerateSlots_ForeignCaProfileId_SuperAdmin_Generates()
    {
        AsSuperAdmin();
        var other = await SeedProfileAsync(_otherUserId, "CA Priya Sharma");
        var slotGen = new Mock<ISlotGenerationService>();
        slotGen.Setup(s => s.GenerateAsync(other.Id, It.IsAny<int>(), It.IsAny<CancellationToken>()))
               .ReturnsAsync((3, 0));
        var handler = new GenerateSlotsFromRulesCommandHandler(_db, _currentUser.Object, slotGen.Object);

        var result = await handler.Handle(new GenerateSlotsFromRulesCommand(other.Id, 1), default);

        result.IsSuccess.Should().BeTrue();
        slotGen.Verify(s => s.GenerateAsync(other.Id, 1, It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── GetMyCaProfileQuery ────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyCaProfile_ReturnsOnlyOwnProfile_NeverAnothers()
    {
        await SeedProfileAsync(_otherUserId, "CA Priya Sharma");
        var mine = await SeedProfileAsync(_callerUserId, "CA Me");
        var handler = new GetMyCaProfileQueryHandler(_db, _currentUser.Object);

        var result = await handler.Handle(new GetMyCaProfileQuery(), default);

        result.IsSuccess.Should().BeTrue();
        result.Value!.CaProfileId.Should().Be(mine.Id);
        result.Value!.UserId.Should().Be(_callerUserId);
    }

    [Fact]
    public async Task GetMyCaProfile_NoProfile_ReturnsNotFound()
    {
        await SeedProfileAsync(_otherUserId, "CA Priya Sharma"); // someone else's profile exists
        var handler = new GetMyCaProfileQueryHandler(_db, _currentUser.Object);

        var result = await handler.Handle(new GetMyCaProfileQuery(), default);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Type.Should().Be(ErrorType.NotFound);
    }
}
