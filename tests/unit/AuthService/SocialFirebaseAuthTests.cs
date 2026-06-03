using System.Security.Cryptography;
using System.Text;
using AuthService.Application.Auth.Commands.SocialFirebaseAuth;
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
/// Unit tests for POST /auth/social/firebase (SocialFirebaseAuthCommand).
/// Covers: new-user creation, existing-user lookup, dev-bypass path,
/// 2FA-enabled user returns challenge, and validator edge cases.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SocialFirebaseAuthTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Mock<IFirebaseAuthService> _firebase;
    private readonly Mock<IUserRepository> _userRepo;
    private readonly Mock<IRefreshTokenRepository> _refreshRepo;
    private readonly Mock<IChallengeTokenService> _challenge;

    // Cache the env var's original value so we restore it after each test.
    private readonly string? _originalBypassValue;

    public SocialFirebaseAuthTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);

        _firebase = new Mock<IFirebaseAuthService>();
        _userRepo = new Mock<IUserRepository>();
        _refreshRepo = new Mock<IRefreshTokenRepository>();
        _challenge = new Mock<IChallengeTokenService>();

        // Default: CreateCustomTokenAsync succeeds
        _firebase
            .Setup(f => f.CreateCustomTokenAsync(
                It.IsAny<string>(), It.IsAny<IDictionary<string, object>?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success("fake-custom-token"));

        // Default: refresh token persisted successfully
        _refreshRepo
            .Setup(r => r.AddAsync(It.IsAny<RefreshToken>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((RefreshToken rt, CancellationToken _) => rt);

        // Preserve original env var value so tests don't leak state.
        _originalBypassValue = Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS");
        // Ensure bypass is OFF by default for each test.
        Environment.SetEnvironmentVariable("DEV_AUTH_BYPASS", "false");
    }

    public void Dispose()
    {
        _db.Dispose();
        // Restore the env var to avoid cross-test pollution.
        Environment.SetEnvironmentVariable("DEV_AUTH_BYPASS", _originalBypassValue);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private SocialFirebaseAuthCommandHandler MakeHandler() =>
        new(_firebase.Object, _userRepo.Object, _refreshRepo.Object, _db, _challenge.Object);

    /// <summary>Activates DEV_AUTH_BYPASS for the duration of the calling test.</summary>
    private void EnableBypass() =>
        Environment.SetEnvironmentVariable("DEV_AUTH_BYPASS", "true");

    private void SetupVerifyToken(string uid, string? email, string? name) =>
        _firebase
            .Setup(f => f.VerifyIdTokenAndGetClaimsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<FirebaseTokenClaims>.Success(new FirebaseTokenClaims(uid, email, name)));

    private void SetupVerifyTokenFailure() =>
        _firebase
            .Setup(f => f.VerifyIdTokenAndGetClaimsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Error.Unauthorized("Firebase.TokenInvalid", "Invalid token."));

    // ═══════════════════════════════════════════════════════════════════════
    // New-user creation (production path)
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task NewUser_GoogleSignIn_CreatesUserAndReturnsToken()
    {
        // Arrange
        SetupVerifyToken("google-uid-123", "alice@gmail.com", "Alice Smith");
        _userRepo.Setup(r => r.GetByFirebaseUidAsync("google-uid-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("alice@gmail.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);

        User? capturedUser = null;
        _userRepo.Setup(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Callback<User, CancellationToken>((u, _) => capturedUser = u)
            .ReturnsAsync((User u, CancellationToken _) => u);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("firebase-id-token", "google", "alice@gmail.com", "Alice Smith"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsNewUser.Should().BeTrue();
        result.Value.Token.Should().Be("fake-custom-token");
        result.Value.RefreshToken.Should().NotBeNullOrWhiteSpace();
        result.Value.RefreshExpiresAt.Should().BeAfter(DateTime.UtcNow);
        result.Value.Requires2fa.Should().BeFalse();
        result.Value.ChallengeToken.Should().BeNull();

        capturedUser.Should().NotBeNull();
        capturedUser!.Email.Should().Be("alice@gmail.com");
        capturedUser.FullName.Should().Be("Alice Smith");

        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()), Times.Once);
        _refreshRepo.Verify(r => r.AddAsync(It.IsAny<RefreshToken>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task NewUser_AppleSignIn_ServerVerifiedEmailPreferredOverClientHint()
    {
        // Arrange: server-verified email differs from client hint
        SetupVerifyToken("apple-uid-456", "real@icloud.com", null);
        _userRepo.Setup(r => r.GetByFirebaseUidAsync("apple-uid-456", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("real@icloud.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);

        User? capturedUser = null;
        _userRepo.Setup(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Callback<User, CancellationToken>((u, _) => capturedUser = u)
            .ReturnsAsync((User u, CancellationToken _) => u);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("firebase-id-token", "apple", "client-hint@icloud.com", "Bob"),
            CancellationToken.None);

        // Assert: server-verified email wins
        result.IsSuccess.Should().BeTrue();
        capturedUser!.Email.Should().Be("real@icloud.com",
            "server-verified email from Firebase token takes precedence over client hint");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Existing-user lookup
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task ExistingUser_FoundByFirebaseUid_ReturnsIsNewUserFalse()
    {
        // Arrange
        var existingUser = new User { Email = "existing@gmail.com", FullName = "Existing User" };
        existingUser.LinkFirebaseUid("google-uid-existing");

        SetupVerifyToken("google-uid-existing", "existing@gmail.com", "Existing User");
        _userRepo.Setup(r => r.GetByFirebaseUidAsync("google-uid-existing", It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingUser);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("firebase-id-token", "google"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsNewUser.Should().BeFalse();
        result.Value.Token.Should().Be("fake-custom-token");

        // No new user should be created
        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ExistingUser_FoundByEmail_LinksFirebaseUid()
    {
        // Arrange: user created via OTP (no Firebase UID), now signs in with Google
        var existingUser = new User { Email = "otp-user@gmail.com" };

        SetupVerifyToken("new-google-uid", "otp-user@gmail.com", "OTP User");
        _userRepo.Setup(r => r.GetByFirebaseUidAsync("new-google-uid", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("otp-user@gmail.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingUser);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("firebase-id-token", "google"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsNewUser.Should().BeFalse();
        existingUser.FirebaseUid.Should().Be("new-google-uid",
            "Firebase UID should be linked when user was previously OTP-only");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEV_AUTH_BYPASS path
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task DevBypass_SkipsFirebaseVerification_TrustsEmailDirectly()
    {
        // Arrange
        EnableBypass();

        _userRepo.Setup(r => r.GetByFirebaseUidAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("dev@test.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((User u, CancellationToken _) => u);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("any-token", "google", "dev@test.com", "Dev User"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsNewUser.Should().BeTrue();
        result.Value.Token.Should().Be("fake-custom-token");

        // Firebase token verification must NOT be called in bypass mode
        _firebase.Verify(
            f => f.VerifyIdTokenAndGetClaimsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task DevBypass_ExistingUser_ReturnsTokenWithoutVerification()
    {
        // Arrange
        EnableBypass();

        var existingUser = new User { Email = "dev-existing@test.com" };
        existingUser.LinkFirebaseUid("dev_google_dev-existing@test.com");

        _userRepo.Setup(r => r.GetByFirebaseUidAsync("dev_google_dev-existing@test.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingUser);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("any-token", "google", "dev-existing@test.com"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsNewUser.Should().BeFalse();
        _firebase.Verify(
            f => f.VerifyIdTokenAndGetClaimsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2FA-enabled user returns challenge token
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task TwoFaEnabledUser_ReturnsChallengeTokenInsteadOfJwt()
    {
        // Arrange: seed a user with an active TOTP record in InMemory DB
        var user = new User { Email = "totp-user@gmail.com" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = "ENC:some-secret",
            IsEnabled = true,
            ConfirmedAt = DateTime.UtcNow.AddDays(-1)
        });
        await _db.SaveChangesAsync();

        SetupVerifyToken("totp-google-uid", "totp-user@gmail.com", null);
        _userRepo.Setup(r => r.GetByFirebaseUidAsync("totp-google-uid", It.IsAny<CancellationToken>()))
            .ReturnsAsync(user);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        _challenge.Setup(c => c.Issue(user.Id)).Returns("challenge-token-xyz");

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("firebase-id-token", "google"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Requires2fa.Should().BeTrue();
        result.Value.ChallengeToken.Should().Be("challenge-token-xyz");
        result.Value.Token.Should().BeNull("JWT must not be issued when 2FA is required");
        result.Value.RefreshToken.Should().BeNull("refresh token must not be issued when 2FA is required");

        // No refresh token persisted when 2FA gate fires
        _refreshRepo.Verify(r => r.AddAsync(It.IsAny<RefreshToken>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Firebase token verification failure
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InvalidFirebaseToken_ReturnsUnauthorized()
    {
        // Arrange
        SetupVerifyTokenFailure();
        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("bad-token", "google"),
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Unauthorized);
        result.Error.Code.Should().Be("Firebase.TokenInvalid");

        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Validator edge cases
    // ═══════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("", "google")]         // empty token
    [InlineData("token", "")]           // empty provider
    [InlineData("token", "facebook")]   // unsupported provider
    [InlineData("token", "twitter")]    // unsupported provider
    public void Validator_InvalidInput_FailsWithoutBypass(string token, string provider)
    {
        // devBypass=false → no email requirement
        var v = new SocialFirebaseAuthCommandValidator(devBypass: false);
        v.Validate(new SocialFirebaseAuthCommand(token, provider)).IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData("token", "google")]
    [InlineData("token", "apple")]
    [InlineData("token", "GOOGLE")]   // case-insensitive
    [InlineData("token", "Apple")]    // case-insensitive
    public void Validator_ValidProviders_PassWithoutBypass(string token, string provider)
    {
        var v = new SocialFirebaseAuthCommandValidator(devBypass: false);
        v.Validate(new SocialFirebaseAuthCommand(token, provider)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_DevBypass_MissingEmail_Fails()
    {
        // Under DEV_AUTH_BYPASS, email must be supplied (no Firebase token to extract it from)
        var v = new SocialFirebaseAuthCommandValidator(devBypass: true);

        var withoutEmail = v.Validate(new SocialFirebaseAuthCommand("token", "google", null));
        withoutEmail.IsValid.Should().BeFalse("email is required under DEV_AUTH_BYPASS");
    }

    [Fact]
    public void Validator_DevBypass_WithEmail_Passes()
    {
        var v = new SocialFirebaseAuthCommandValidator(devBypass: true);
        var withEmail = v.Validate(new SocialFirebaseAuthCommand("token", "google", "dev@test.com"));
        withEmail.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_DevBypass_AppleWithEmail_Passes()
    {
        var v = new SocialFirebaseAuthCommandValidator(devBypass: true);
        var result = v.Validate(new SocialFirebaseAuthCommand("any-token", "apple", "user@example.com"));
        result.IsValid.Should().BeTrue();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Refresh token shape verification
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task SuccessfulSignIn_RefreshTokenStoredAsHash_PlaintextReturnedToClient()
    {
        // Arrange
        SetupVerifyToken("uid-refresh", "refresh@test.com", null);
        _userRepo.Setup(r => r.GetByFirebaseUidAsync("uid-refresh", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("refresh@test.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.AddAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((User u, CancellationToken _) => u);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        RefreshToken? capturedRefresh = null;
        _refreshRepo
            .Setup(r => r.AddAsync(It.IsAny<RefreshToken>(), It.IsAny<CancellationToken>()))
            .Callback<RefreshToken, CancellationToken>((rt, _) => capturedRefresh = rt)
            .ReturnsAsync((RefreshToken rt, CancellationToken _) => rt);

        var handler = MakeHandler();

        // Act
        var result = await handler.Handle(
            new SocialFirebaseAuthCommand("firebase-id-token", "google"),
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        capturedRefresh.Should().NotBeNull();
        capturedRefresh!.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromSeconds(5));
        capturedRefresh.TokenHash.Should().NotBeNullOrWhiteSpace("hash stored in DB, not plaintext");

        // The returned plaintext token, when SHA-256 hashed, must equal the stored hash
        var returnedPlain = result.Value.RefreshToken!;
        var expectedHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(returnedPlain)));
        capturedRefresh.TokenHash.Should().BeEquivalentTo(expectedHash,
            "SHA-256 hex of returned plaintext must match stored hash");
    }
}
