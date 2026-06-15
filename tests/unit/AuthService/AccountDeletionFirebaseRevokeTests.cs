using AuthService.Application.Interfaces;
using AuthService.Application.Users.Commands.RequestAccountDeletion;
using AuthService.Domain.Entities;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// B1 / GAP-003: Verifies that account deletion succeeds even when Firebase revoke fails,
/// and that a Hangfire retry is enqueued via IFirebaseRevokeRetryScheduler.
/// Acceptance criteria: DPDP Act 2023 erasure MUST complete locally regardless of Firebase
/// availability; any failure MUST trigger a logged, observable retry.
/// </summary>
[Trait("Category", "Unit")]
public sealed class AccountDeletionFirebaseRevokeTests
{
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IRefreshTokenRepository> _refreshTokenRepo = new();
    private readonly Mock<IFirebaseAuthService> _firebaseAuth = new();
    private readonly Mock<ICurrentUser> _currentUser = new();
    private readonly Mock<IFirebaseRevokeRetryScheduler> _revokeScheduler = new();

    private RequestAccountDeletionCommandHandler BuildSut() =>
        new(_userRepo.Object, _refreshTokenRepo.Object, _firebaseAuth.Object,
            _currentUser.Object, _revokeScheduler.Object,
            NullLogger<RequestAccountDeletionCommandHandler>.Instance);

    private User CreateUserWithFirebaseUid(string uid)
    {
        var user = new User { PhoneNumber = "+919876543210" };
        user.LinkFirebaseUid(uid);
        return user;
    }

    private void SetupUserAndCurrentUser(User user)
    {
        _currentUser.Setup(c => c.UserId).Returns(user.Id);
        _currentUser.Setup(c => c.IsAuthenticated).Returns(true);
        _userRepo.Setup(r => r.GetByIdAsync(user.Id, It.IsAny<CancellationToken>()))
                 .ReturnsAsync(user);
        _userRepo.Setup(r => r.UpdateAsync(user, It.IsAny<CancellationToken>()))
                 .Returns(Task.CompletedTask);
        _refreshTokenRepo
            .Setup(r => r.RevokeAllForUserAsync(user.Id, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    [Fact]
    public async Task Handle_WhenFirebaseRevokeSucceeds_DeletionSucceedsAndNoRetryEnqueued()
    {
        // Arrange
        var user = CreateUserWithFirebaseUid("firebase-uid-123");
        SetupUserAndCurrentUser(user);
        _firebaseAuth
            .Setup(f => f.RevokeRefreshTokensAsync("firebase-uid-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        // Act
        var result = await BuildSut().Handle(new RequestAccountDeletionCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue("deletion must succeed when Firebase revoke succeeds");
        _revokeScheduler.Verify(
            s => s.ScheduleRevoke(It.IsAny<string>(), It.IsAny<Guid>()), Times.Never,
            "no retry should be scheduled when revoke succeeds");
        _userRepo.Verify(r => r.UpdateAsync(user, It.IsAny<CancellationToken>()), Times.Once,
            "local erasure must persist");
    }

    [Fact]
    public async Task Handle_WhenFirebaseRevokeReturnsFailure_DeletionStillSucceedsAndRetryEnqueued()
    {
        // Arrange — GAP-003 acceptance: deletion must complete even when Firebase returns failure
        var user = CreateUserWithFirebaseUid("firebase-uid-123");
        SetupUserAndCurrentUser(user);
        _firebaseAuth
            .Setup(f => f.RevokeRefreshTokensAsync("firebase-uid-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(Error.Validation("Firebase.RevokeFailed", "Firebase unavailable")));

        // Act
        var result = await BuildSut().Handle(new RequestAccountDeletionCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue("DPDP erasure must complete regardless of Firebase availability");
        _revokeScheduler.Verify(
            s => s.ScheduleRevoke("firebase-uid-123", user.Id), Times.Once,
            "a retry must be scheduled when Firebase revoke fails");
        _userRepo.Verify(r => r.UpdateAsync(user, It.IsAny<CancellationToken>()), Times.Once,
            "local erasure must persist even when Firebase fails");
    }

    [Fact]
    public async Task Handle_WhenFirebaseRevokeThrows_DeletionStillSucceedsAndRetryEnqueued()
    {
        // Arrange — exception case: network failure, Firebase SDK outage, etc.
        var user = CreateUserWithFirebaseUid("firebase-uid-123");
        SetupUserAndCurrentUser(user);
        _firebaseAuth
            .Setup(f => f.RevokeRefreshTokensAsync("firebase-uid-123", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Network unreachable"));

        // Act
        var result = await BuildSut().Handle(new RequestAccountDeletionCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue("exception during Firebase revoke must not abort local DPDP erasure");
        _revokeScheduler.Verify(
            s => s.ScheduleRevoke("firebase-uid-123", user.Id), Times.Once,
            "retry must be scheduled even when the revoke call throws");
    }

    [Fact]
    public async Task Handle_WhenUserHasNoFirebaseUid_DeletionSucceedsWithoutCallingFirebase()
    {
        // Arrange — user who has never linked Firebase (e.g., local-auth dev user)
        var user = new User { PhoneNumber = "+919876543210" };  // FirebaseUid is null
        SetupUserAndCurrentUser(user);

        // Act
        var result = await BuildSut().Handle(new RequestAccountDeletionCommand(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        _firebaseAuth.Verify(
            f => f.RevokeRefreshTokensAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never, "Firebase revoke should not be called for users without a Firebase UID");
        _revokeScheduler.Verify(
            s => s.ScheduleRevoke(It.IsAny<string>(), It.IsAny<Guid>()), Times.Never);
    }
}
