using AuthService.Application.Auth.Commands.RefreshContext;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentAssertions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// B4 / GAP-007 / BUG-5: Verifies that POST /auth/token/refresh-context re-issues a session
/// JWT with current claims for the authenticated user, and correctly handles edge cases such
/// as unauthenticated calls, deleted users, and downstream token-mint failures.
/// </summary>
[Trait("Category", "Unit")]
public sealed class RefreshContextCommandTests
{
    private readonly Mock<IFirebaseAuthService> _firebaseAuth = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<ICurrentUser> _currentUser = new();

    private RefreshContextCommandHandler BuildSut() =>
        new(_firebaseAuth.Object, _userRepo.Object, _currentUser.Object);

    private void SetupAuthenticatedUser(User user)
    {
        _currentUser.Setup(c => c.IsAuthenticated).Returns(true);
        _currentUser.Setup(c => c.UserId).Returns(user.Id);
        _userRepo.Setup(r => r.GetByIdAsync(user.Id, It.IsAny<CancellationToken>()))
                 .ReturnsAsync(user);
    }

    [Fact]
    public async Task Handle_WhenAuthenticatedWithOrg_ReturnsNewAccessToken()
    {
        // Arrange
        var user = new User { Email = "owner@snap.in" };
        user.LinkFirebaseUid("firebase-uid-owner");
        SetupAuthenticatedUser(user);
        _firebaseAuth
            .Setup(f => f.CreateCustomTokenAsync(
                "firebase-uid-owner",
                It.IsAny<Dictionary<string, object>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success("fresh.jwt.token"));

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
}
