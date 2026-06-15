using AuthService.Application.Auth.Commands.RefreshContext;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// B4 / GAP-007 / BUG-5 / ORG-SWITCHER: Verifies that POST /auth/token/refresh-context
/// re-issues a session JWT with current claims for the authenticated user, and correctly
/// handles edge cases such as unauthenticated calls, deleted users, and downstream token-mint
/// failures.
///
/// New test groups:
///   - Org-switcher: member / non-member / soft-deleted-member cases (security gate).
///   - Response shape: OrganizationId echo field.
/// </summary>
[Trait("Category", "Unit")]
public sealed class RefreshContextCommandTests : IDisposable
{
    private readonly Mock<IFirebaseAuthService> _firebaseAuth = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<ICurrentUser> _currentUser = new();
    private readonly AuthDbContext _db;

    public RefreshContextCommandTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private RefreshContextCommandHandler BuildSut() =>
        new(_firebaseAuth.Object, _userRepo.Object, _db, _currentUser.Object);

    private void SetupAuthenticatedUser(User user)
    {
        _currentUser.Setup(c => c.IsAuthenticated).Returns(true);
        _currentUser.Setup(c => c.UserId).Returns(user.Id);
        _userRepo.Setup(r => r.GetByIdAsync(user.Id, It.IsAny<CancellationToken>()))
                 .ReturnsAsync(user);
    }

    private void SetupSuccessfulTokenMint(string uid, string token = "fresh.jwt.token")
    {
        _firebaseAuth
            .Setup(f => f.CreateCustomTokenAsync(
                uid,
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success(token));
    }

    // ── Existing behaviour (no OrganizationId) ────────────────────────────────

    [Fact]
    public async Task Handle_WhenAuthenticatedWithOrg_ReturnsNewAccessToken()
    {
        // Arrange
        var user = new User { Email = "owner@snap.in" };
        user.LinkFirebaseUid("firebase-uid-owner");
        SetupAuthenticatedUser(user);
        SetupSuccessfulTokenMint("firebase-uid-owner");

        // Act
        var result = await BuildSut().Handle(new RefreshContextCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.AccessToken.Should().Be("fresh.jwt.token",
            "the re-issued token must be the value returned by CreateCustomTokenAsync");
        result.Value.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddHours(12), TimeSpan.FromMinutes(1),
            "token lifetime must be 12 h consistent with login flow");
    }

    [Fact]
    public async Task Handle_WhenNotAuthenticated_ReturnsUnauthorized()
    {
        // Arrange
        _currentUser.Setup(c => c.IsAuthenticated).Returns(false);
        _currentUser.Setup(c => c.UserId).Returns(Guid.Empty);

        // Act
        var result = await BuildSut().Handle(new RefreshContextCommand(), CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Unauthorized,
            "unauthenticated callers must receive 401, not 500");
    }

    [Fact]
    public async Task Handle_WhenUserNotFoundOrDeleted_ReturnsNotFound()
    {
        // Arrange
        var userId = Guid.NewGuid();
        _currentUser.Setup(c => c.IsAuthenticated).Returns(true);
        _currentUser.Setup(c => c.UserId).Returns(userId);
        _userRepo.Setup(r => r.GetByIdAsync(userId, It.IsAny<CancellationToken>()))
                 .ReturnsAsync((User?)null);

        // Act
        var result = await BuildSut().Handle(new RefreshContextCommand(), CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTokenMintFails_PropagatesError()
    {
        // Arrange — Firebase Custom Token service returns an error (e.g. quota exceeded)
        var user = new User { Email = "owner@snap.in" };
        user.LinkFirebaseUid("firebase-uid-owner");
        SetupAuthenticatedUser(user);
        _firebaseAuth
            .Setup(f => f.CreateCustomTokenAsync(
                It.IsAny<string>(),
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Failure(Error.Validation("Token.MintFailed", "Firebase quota exceeded")));

        // Act
        var result = await BuildSut().Handle(new RefreshContextCommand(), CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Message.Should().Contain("Firebase quota exceeded");
    }

    [Fact]
    public async Task Handle_WhenUserHasNoFirebaseUid_FallsBackToUserIdAsSubject()
    {
        // Arrange — user without a Firebase UID (e.g. local-auth only)
        var user = new User { Email = "localdev@snap.in" };  // FirebaseUid is null
        SetupAuthenticatedUser(user);
        _firebaseAuth
            .Setup(f => f.CreateCustomTokenAsync(
                user.Id.ToString(),   // must fall back to user.Id
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success("local.jwt.token"));

        // Act
        var result = await BuildSut().Handle(new RefreshContextCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        _firebaseAuth.Verify(
            f => f.CreateCustomTokenAsync(
                user.Id.ToString(),
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()),
            Times.Once, "must fall back to user.Id.ToString() when FirebaseUid is null");
    }

    // ── Org-switcher: security gate tests ─────────────────────────────────────

    /// <summary>
    /// ORG-SWITCHER: When the caller provides a valid OrganizationId and is an active
    /// member of that org, the token is minted with that org's context and the response
    /// echoes back the organizationId.
    /// </summary>
    [Fact]
    public async Task Handle_WithValidOrgId_ActiveMember_MintsTokenAndEchosOrgId()
    {
        // Arrange
        var orgId = Guid.NewGuid();
        var user = new User { Email = "switcher@snap.in" };
        user.LinkFirebaseUid("firebase-uid-switcher");
        SetupAuthenticatedUser(user);
        SetupSuccessfulTokenMint("firebase-uid-switcher", "org-switched.jwt");

        // Seed active membership using the user's auto-generated Id
        _db.OrganizationMembers.Add(OrganizationMember.Create(orgId, user.Id, Guid.NewGuid()));
        await _db.SaveChangesAsync();

        // Act
        var result = await BuildSut().Handle(
            new RefreshContextCommand(OrganizationId: orgId), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue("active member requesting own org must succeed");
        result.Value.AccessToken.Should().Be("org-switched.jwt");
        result.Value.OrganizationId.Should().Be(orgId,
            "response must echo the requested organizationId for mobile to confirm the switch");
    }

    /// <summary>
    /// ORG-SWITCHER SECURITY: When the caller supplies an OrganizationId they are NOT a member of,
    /// the handler MUST return Forbidden — never silently falling back to another org.
    /// This is the entire security gate for claim minting.
    /// </summary>
    [Fact]
    public async Task Handle_WithOrgId_NotAMember_ReturnsForbidden()
    {
        // Arrange
        var otherOrgId = Guid.NewGuid(); // org the user has no membership in
        var user = new User { Email = "noMember@snap.in" };
        user.LinkFirebaseUid("firebase-uid-nomember");
        SetupAuthenticatedUser(user);

        // User has NO OrganizationMember rows at all
        // (no _db.OrganizationMembers seeding)

        // Act
        var result = await BuildSut().Handle(
            new RefreshContextCommand(OrganizationId: otherOrgId), CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue("non-member must be rejected");
        result.Error.Type.Should().Be(ErrorType.Forbidden,
            "the error must be Forbidden (403), not just a validation error or 401");
        result.Error.Code.Should().Be("Auth.OrgSwitchForbidden");

        // Critical: token must NOT be minted
        _firebaseAuth.Verify(
            f => f.CreateCustomTokenAsync(
                It.IsAny<string>(),
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()),
            Times.Never,
            "CreateCustomTokenAsync must NOT be called when membership check fails");
    }

    /// <summary>
    /// ORG-SWITCHER SECURITY: A soft-deleted membership (DeletedAt set) must be treated
    /// as non-existent — the user cannot switch to an org they have been removed from.
    /// </summary>
    [Fact]
    public async Task Handle_WithOrgId_SoftDeletedMembership_ReturnsForbidden()
    {
        // Arrange
        var orgId = Guid.NewGuid();
        var user = new User { Email = "deleted@snap.in" };
        user.LinkFirebaseUid("firebase-uid-deleted");
        SetupAuthenticatedUser(user);

        // Seed a SOFT-DELETED membership (Deactivate + set DeletedAt)
        var member = OrganizationMember.Create(orgId, user.Id, Guid.NewGuid());
        member.Deactivate();
        member.DeletedAt = DateTime.UtcNow.AddDays(-1); // soft-deleted
        _db.OrganizationMembers.Add(member);
        await _db.SaveChangesAsync();

        // Act
        var result = await BuildSut().Handle(
            new RefreshContextCommand(OrganizationId: orgId), CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue("soft-deleted membership must not grant org access");
        result.Error.Type.Should().Be(ErrorType.Forbidden,
            "soft-deleted membership must return 403, not 200");

        _firebaseAuth.Verify(
            f => f.CreateCustomTokenAsync(
                It.IsAny<string>(),
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    /// <summary>
    /// ORG-SWITCHER SECURITY: An IsActive=false (suspended) membership — even without soft-delete —
    /// must also be rejected. IsActive and DeletedAt are both guards.
    /// </summary>
    [Fact]
    public async Task Handle_WithOrgId_InactiveMembership_ReturnsForbidden()
    {
        // Arrange
        var orgId = Guid.NewGuid();
        var user = new User { Email = "inactive@snap.in" };
        user.LinkFirebaseUid("firebase-uid-inactive");
        SetupAuthenticatedUser(user);

        // Seed an INACTIVE membership (IsActive=false, DeletedAt=null)
        var member = OrganizationMember.Create(orgId, user.Id, Guid.NewGuid());
        member.Deactivate(); // IsActive=false; DeletedAt remains null
        _db.OrganizationMembers.Add(member);
        await _db.SaveChangesAsync();

        // Act
        var result = await BuildSut().Handle(
            new RefreshContextCommand(OrganizationId: orgId), CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue("IsActive=false membership must be rejected");
        result.Error.Type.Should().Be(ErrorType.Forbidden);
    }

    /// <summary>
    /// ORG-SWITCHER: When OrganizationId is not supplied (null), the handler keeps the
    /// existing behaviour — no membership check, most-recently-created org wins.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutOrgId_NoMembershipCheck_UsesDefaultBehaviour()
    {
        // Arrange
        var user = new User { Email = "owner@snap.in" };
        user.LinkFirebaseUid("firebase-uid-default");
        SetupAuthenticatedUser(user);
        SetupSuccessfulTokenMint("firebase-uid-default", "default.jwt");

        // Act — no OrganizationId in command
        var result = await BuildSut().Handle(new RefreshContextCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue("absent OrganizationId must not trigger membership check");
        result.Value.OrganizationId.Should().BeNull(
            "response OrganizationId must be null when caller did not request a specific org");
    }

    /// <summary>
    /// ORG-SWITCHER VALIDATOR: an empty GUID (Guid.Empty) in OrganizationId should fail validation.
    /// </summary>
    [Fact]
    public void Validator_EmptyOrgId_IsRejected()
    {
        var validator = new RefreshContextCommandValidator();
        var result = validator.Validate(new RefreshContextCommand(OrganizationId: Guid.Empty));

        result.IsValid.Should().BeFalse("Guid.Empty is not a valid organizationId");
        result.Errors.Should().Contain(e => e.PropertyName == "OrganizationId");
    }

    /// <summary>Null (absent) OrganizationId passes validation — backward compatible.</summary>
    [Fact]
    public void Validator_NullOrgId_Passes()
    {
        var validator = new RefreshContextCommandValidator();
        var result = validator.Validate(new RefreshContextCommand(OrganizationId: null));

        result.IsValid.Should().BeTrue("null OrganizationId is the default and must be accepted");
    }
}
