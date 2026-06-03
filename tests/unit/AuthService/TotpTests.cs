using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AuthService.Application.TwoFactor.Commands.ConfirmTotp;
using AuthService.Application.TwoFactor.Commands.DisableTotp;
using AuthService.Application.TwoFactor.Commands.EnrollTotp;
using AuthService.Application.TwoFactor.Queries.GetTotpStatus;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;
using AuthService.Application.Interfaces;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the 2FA TOTP enroll / confirm / disable / status flow.
/// Uses EF Core InMemory + mocked IEncryptionService / ITotpValidator for isolation.
/// </summary>
[Trait("Category", "Unit")]
public sealed class TotpTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Mock<IEncryptionService> _encryption;
    private readonly Mock<ITotpValidator> _totpValidator;

    // Pass-through encryption so we can see what was stored
    private const string FakeEncryptedPrefix = "ENC:";
    private const string FakeBase32 = "JBSWY3DPEHPK3PXP"; // known test secret

    public TotpTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);

        _encryption = new Mock<IEncryptionService>();
        _encryption.Setup(e => e.Encrypt(It.IsAny<string>()))
            .Returns<string>(s => $"{FakeEncryptedPrefix}{s}");
        _encryption.Setup(e => e.Decrypt(It.IsAny<string>()))
            .Returns<string>(s => s.StartsWith(FakeEncryptedPrefix) ? s[FakeEncryptedPrefix.Length..] : s);

        _totpValidator = new Mock<ITotpValidator>();
    }

    public void Dispose() => _db.Dispose();

    // ── helpers ──────────────────────────────────────────────────────────

    private static Mock<ICurrentUser> MkUser(Guid id)
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(id);
        return m;
    }

    private async Task<User> SeedUserAsync()
    {
        var user = new User { Email = $"user{Guid.NewGuid():N}@test.com" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    // ═══════════════════════════════════════════════════════════════════
    // EnrollTotp
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task EnrollTotp_FirstEnrollment_StoresUnconfirmedRecord()
    {
        var user = await SeedUserAsync();
        var handler = new EnrollTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object);

        var result = await handler.Handle(new EnrollTotpCommand(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.OtpauthUri.Should().Contain("otpauth://totp/SnapAccount");
        result.Value.Base32Secret.Should().NotBeNullOrWhiteSpace();

        var stored = await _db.UserTotps.FirstOrDefaultAsync(t => t.UserId == user.Id);
        stored.Should().NotBeNull();
        stored!.IsEnabled.Should().BeFalse("enrollment is not confirmed yet");
        stored.SecretEncrypted.Should().StartWith(FakeEncryptedPrefix);
    }

    [Fact]
    public async Task EnrollTotp_AlreadyEnabled_ReturnsConflict()
    {
        var user = await SeedUserAsync();
        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = "ENC:something",
            IsEnabled = true,
            ConfirmedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        var handler = new EnrollTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object);
        var result = await handler.Handle(new EnrollTotpCommand(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public async Task EnrollTotp_UnconfirmedExisting_Overwrites()
    {
        var user = await SeedUserAsync();
        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = "ENC:old-secret",
            IsEnabled = false
        });
        await _db.SaveChangesAsync();

        var handler = new EnrollTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object);
        var result = await handler.Handle(new EnrollTotpCommand(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var allRecords = await _db.UserTotps.Where(t => t.UserId == user.Id).ToListAsync();
        allRecords.Should().HaveCount(1, "overwrite — not a new row");
        allRecords[0].SecretEncrypted.Should().NotBe("ENC:old-secret");
    }

    // ═══════════════════════════════════════════════════════════════════
    // ConfirmTotp
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task ConfirmTotp_ValidCode_EnablesTotpAndReturnsRecoveryCodes()
    {
        var user = await SeedUserAsync();
        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = $"{FakeEncryptedPrefix}{FakeBase32}",
            IsEnabled = false
        });
        await _db.SaveChangesAsync();

        _totpValidator.Setup(v => v.Verify(FakeBase32, "123456")).Returns(true);

        var handler = new ConfirmTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object, _totpValidator.Object);
        var result = await handler.Handle(new ConfirmTotpCommand("123456"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.RecoveryCodes.Should().HaveCount(8);
        result.Value.RecoveryCodes.Should().AllSatisfy(c =>
            c.Should().MatchRegex(@"^[0-9A-F]{6}-[0-9A-F]{6}$"));

        var stored = await _db.UserTotps.FirstAsync(t => t.UserId == user.Id);
        stored.IsEnabled.Should().BeTrue();
        stored.ConfirmedAt.Should().NotBeNull();
        stored.RecoveryCodes.Should().NotBeNullOrWhiteSpace("hashed codes should be stored");

        var hashes = JsonSerializer.Deserialize<List<string>>(stored.RecoveryCodes!);
        hashes.Should().HaveCount(8);
    }

    [Fact]
    public async Task ConfirmTotp_InvalidCode_ReturnsValidationError()
    {
        var user = await SeedUserAsync();
        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = $"{FakeEncryptedPrefix}{FakeBase32}",
            IsEnabled = false
        });
        await _db.SaveChangesAsync();

        _totpValidator.Setup(v => v.Verify(FakeBase32, "999999")).Returns(false);

        var handler = new ConfirmTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object, _totpValidator.Object);
        var result = await handler.Handle(new ConfirmTotpCommand("999999"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Contain("InvalidCode");
    }

    [Fact]
    public async Task ConfirmTotp_NoEnrollment_ReturnsNotFound()
    {
        var user = await SeedUserAsync();
        _totpValidator.Setup(v => v.Verify(It.IsAny<string>(), It.IsAny<string>())).Returns(true);

        var handler = new ConfirmTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object, _totpValidator.Object);
        var result = await handler.Handle(new ConfirmTotpCommand("123456"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    // ═══════════════════════════════════════════════════════════════════
    // DisableTotp
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task DisableTotp_ValidTotpCode_DisablesAndClearsSecret()
    {
        var user = await SeedUserAsync();
        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = $"{FakeEncryptedPrefix}{FakeBase32}",
            IsEnabled = true,
            ConfirmedAt = DateTime.UtcNow,
            RecoveryCodes = JsonSerializer.Serialize(new[] { "hash1" })
        });
        await _db.SaveChangesAsync();

        _totpValidator.Setup(v => v.Verify(FakeBase32, "123456")).Returns(true);

        var handler = new DisableTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object, _totpValidator.Object);
        var result = await handler.Handle(new DisableTotpCommand("123456"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var stored = await _db.UserTotps.FirstAsync(t => t.UserId == user.Id);
        stored.IsEnabled.Should().BeFalse();
        stored.SecretEncrypted.Should().BeEmpty("secret cleared on disable");
        stored.RecoveryCodes.Should().BeNull("recovery codes cleared on disable");
    }

    [Fact]
    public async Task DisableTotp_ValidRecoveryCode_DisablesSuccessfully()
    {
        var user = await SeedUserAsync();
        var recoveryCode = "AABBCC-112233";
        var hash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(recoveryCode))).ToLowerInvariant();

        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = $"{FakeEncryptedPrefix}{FakeBase32}",
            IsEnabled = true,
            ConfirmedAt = DateTime.UtcNow,
            RecoveryCodes = JsonSerializer.Serialize(new[] { hash })
        });
        await _db.SaveChangesAsync();

        var handler = new DisableTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object, _totpValidator.Object);
        var result = await handler.Handle(new DisableTotpCommand(recoveryCode), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task DisableTotp_NotEnabled_ReturnsNotFound()
    {
        var user = await SeedUserAsync();
        var handler = new DisableTotpCommandHandler(_db, MkUser(user.Id).Object, _encryption.Object, _totpValidator.Object);
        var result = await handler.Handle(new DisableTotpCommand("123456"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    // ═══════════════════════════════════════════════════════════════════
    // GetTotpStatus
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetTotpStatus_NoRecord_ReturnsFalse()
    {
        var user = await SeedUserAsync();
        var handler = new GetTotpStatusQueryHandler(_db, MkUser(user.Id).Object);

        var result = await handler.Handle(new GetTotpStatusQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Enabled.Should().BeFalse();
        result.Value.ConfirmedAt.Should().BeNull();
    }

    [Fact]
    public async Task GetTotpStatus_Enabled_ReturnsTrueWithTimestamp()
    {
        var user = await SeedUserAsync();
        var confirmedAt = DateTime.UtcNow.AddMinutes(-5);
        _db.UserTotps.Add(new UserTotp
        {
            UserId = user.Id,
            SecretEncrypted = "ENC:secret",
            IsEnabled = true,
            ConfirmedAt = confirmedAt
        });
        await _db.SaveChangesAsync();

        var handler = new GetTotpStatusQueryHandler(_db, MkUser(user.Id).Object);
        var result = await handler.Handle(new GetTotpStatusQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Enabled.Should().BeTrue();
        result.Value.ConfirmedAt.Should().BeCloseTo(confirmedAt, TimeSpan.FromSeconds(1));
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validators
    // ═══════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("123456")]
    [InlineData("000001")]
    [InlineData("999999")]
    public void ConfirmTotpValidator_SixDigits_Passes(string code)
    {
        var v = new ConfirmTotpCommandValidator();
        v.Validate(new ConfirmTotpCommand(code)).IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("12345")]    // 5 digits
    [InlineData("1234567")]  // 7 digits
    [InlineData("abcdef")]   // letters
    [InlineData("")]
    public void ConfirmTotpValidator_InvalidCode_Fails(string code)
    {
        var v = new ConfirmTotpCommandValidator();
        v.Validate(new ConfirmTotpCommand(code)).IsValid.Should().BeFalse();
    }
}
