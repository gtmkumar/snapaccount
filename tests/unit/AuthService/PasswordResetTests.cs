using System.Security.Cryptography;
using System.Text;
using AuthService.Application.PasswordReset.Commands.ForgotPassword;
using AuthService.Application.PasswordReset.Commands.ResetPassword;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Auth;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;
using AuthService.Application.Interfaces;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the password reset flow:
///   - POST /auth/password/forgot — always 204, logs when no email sender configured
///   - POST /auth/password/reset — validates token, sets password, revokes refresh tokens
/// </summary>
[Trait("Category", "Unit")]
public sealed class PasswordResetTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Mock<IEmailSender> _emailSender;
    private readonly Mock<IPasswordResetUrlBuilder> _urlBuilder;
    private readonly Mock<IPasswordHasher> _passwordHasher;
    private readonly Mock<IRefreshTokenRepository> _refreshTokenRepo;

    public PasswordResetTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);

        _emailSender = new Mock<IEmailSender>();
        _emailSender.Setup(e => e.SendAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        _urlBuilder = new Mock<IPasswordResetUrlBuilder>();
        _urlBuilder.Setup(u => u.Build(It.IsAny<string>()))
            .Returns<string>(t => $"http://localhost:3000/reset-password?token={t}");

        _passwordHasher = new Mock<IPasswordHasher>();
        _passwordHasher.Setup(h => h.Hash(It.IsAny<string>())).Returns<string>(p => $"HASH:{p}");
        _passwordHasher.Setup(h => h.Verify(It.IsAny<string>(), It.IsAny<string?>()))
            .Returns<string, string?>((p, h) => h == $"HASH:{p}");

        _refreshTokenRepo = new Mock<IRefreshTokenRepository>();
        _refreshTokenRepo.Setup(r => r.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    public void Dispose() => _db.Dispose();

    private async Task<User> SeedUserWithEmailAsync(string email)
    {
        var user = new User { Email = email };
        user.SetPasswordHash(PasswordHasher.Hash("OldPass123!"));
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    private ForgotPasswordCommandHandler ForgotHandler() =>
        new(_db, _emailSender.Object, _urlBuilder.Object, NullLogger<ForgotPasswordCommandHandler>.Instance);

    private ResetPasswordCommandHandler ResetHandler() =>
        new(_db, _passwordHasher.Object, _refreshTokenRepo.Object);

    // ═══════════════════════════════════════════════════════════════════
    // ForgotPassword
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task ForgotPassword_KnownEmail_CreatesTokenAndSendsEmail()
    {
        var user = await SeedUserWithEmailAsync("user@example.com");

        var result = await ForgotHandler()
            .Handle(new ForgotPasswordCommand("user@example.com"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        _emailSender.Verify(e => e.SendAsync(
            "user@example.com",
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Once);

        var token = await _db.PasswordResetTokens.FirstOrDefaultAsync(t => t.UserId == user.Id);
        token.Should().NotBeNull();
        token!.IsValid.Should().BeTrue();
        token.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddHours(1), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task ForgotPassword_UnknownEmail_ReturnSuccessWithoutCreatingToken()
    {
        var result = await ForgotHandler()
            .Handle(new ForgotPasswordCommand("nobody@example.com"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("no enumeration — always succeed");
        _emailSender.Verify(e => e.SendAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);

        (await _db.PasswordResetTokens.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task ForgotPassword_EmailCaseInsensitive_FindsUser()
    {
        await SeedUserWithEmailAsync("Test@Example.COM");

        var result = await ForgotHandler()
            .Handle(new ForgotPasswordCommand("test@example.com"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        _emailSender.Verify(e => e.SendAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData("")]
    [InlineData("notanemail")]
    [InlineData("missing@")]
    public void ForgotPasswordValidator_InvalidEmail_Fails(string email)
    {
        var v = new ForgotPasswordCommandValidator();
        v.Validate(new ForgotPasswordCommand(email)).IsValid.Should().BeFalse();
    }

    // ═══════════════════════════════════════════════════════════════════
    // ResetPassword
    // ═══════════════════════════════════════════════════════════════════

    private static (string Plain, string Hash) GenerateTokenPair()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        // Base64url (same as in handler)
        var plain = Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plain))).ToLowerInvariant();
        return (plain, hash);
    }

    [Fact]
    public async Task ResetPassword_ValidToken_UpdatesPasswordAndRevokesTokens()
    {
        var user = await SeedUserWithEmailAsync("reset@example.com");
        var (plain, hash) = GenerateTokenPair();
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = hash,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        });
        await _db.SaveChangesAsync();

        var result = await ResetHandler()
            .Handle(new ResetPasswordCommand(plain, "NewPass@123"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        _passwordHasher.Verify(h => h.Hash("NewPass@123"), Times.Once);
        _refreshTokenRepo.Verify(r =>
            r.RevokeAllForUserAsync(user.Id, "Password reset", CancellationToken.None), Times.Once);

        var token = await _db.PasswordResetTokens.FirstAsync(t => t.UserId == user.Id);
        token.UsedAt.Should().NotBeNull("token should be marked used");
    }

    [Fact]
    public async Task ResetPassword_ExpiredToken_ReturnsBadRequest()
    {
        var user = await SeedUserWithEmailAsync("expired@example.com");
        var (plain, hash) = GenerateTokenPair();
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = hash,
            ExpiresAt = DateTime.UtcNow.AddHours(-2)   // expired
        });
        await _db.SaveChangesAsync();

        var result = await ResetHandler()
            .Handle(new ResetPasswordCommand(plain, "NewPass@123"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Contain("InvalidToken");
    }

    [Fact]
    public async Task ResetPassword_UsedToken_ReturnsBadRequest()
    {
        var user = await SeedUserWithEmailAsync("used@example.com");
        var (plain, hash) = GenerateTokenPair();
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = hash,
            ExpiresAt = DateTime.UtcNow.AddHours(1),
            UsedAt = DateTime.UtcNow.AddMinutes(-1)   // already used
        });
        await _db.SaveChangesAsync();

        var result = await ResetHandler()
            .Handle(new ResetPasswordCommand(plain, "NewPass@123"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Contain("InvalidToken");
    }

    [Fact]
    public async Task ResetPassword_WrongToken_ReturnsBadRequest()
    {
        var user = await SeedUserWithEmailAsync("wrong@example.com");
        var (_, hash) = GenerateTokenPair();
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = hash,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        });
        await _db.SaveChangesAsync();

        // Pass a different plaintext token
        var result = await ResetHandler()
            .Handle(new ResetPasswordCommand("completely-wrong-token", "NewPass@123"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }

    [Theory]
    [InlineData("short")]    // < 8 chars
    [InlineData("")]
    public void ResetPasswordValidator_WeakPassword_Fails(string pwd)
    {
        var v = new ResetPasswordCommandValidator();
        v.Validate(new ResetPasswordCommand("token", pwd)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ResetPasswordValidator_ValidPassword_Passes()
    {
        var v = new ResetPasswordCommandValidator();
        v.Validate(new ResetPasswordCommand("token", "MyStr0ng!Pass")).IsValid.Should().BeTrue();
    }
}
