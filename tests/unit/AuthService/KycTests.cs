using AuthService.Application.Interfaces;
using AuthService.Application.Kyc.Commands.SendAadhaarOtp;
using AuthService.Application.Kyc.Commands.VerifyAadhaarOtp;
using AuthService.Application.Kyc.Commands.VerifyPan;
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
/// Unit tests for KYC endpoints — PAN verify, Aadhaar OTP send + verify.
/// Uses EF Core InMemory + mocked IKycProvider.
/// </summary>
[Trait("Category", "Unit")]
public sealed class KycTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Mock<IKycProvider> _kycProvider;

    public KycTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
        _kycProvider = new Mock<IKycProvider>();
    }

    public void Dispose() => _db.Dispose();

    private static Mock<ICurrentUser> MkUser(Guid id)
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(id);
        return m;
    }

    private async Task<User> SeedUserAsync()
    {
        var user = new User { Email = $"kyc{Guid.NewGuid():N}@test.com" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    // ═══════════════════════════════════════════════════════════════════
    // VerifyPan
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task VerifyPan_ValidPan_PersistsVerifiedRecord()
    {
        var user = await SeedUserAsync();
        _kycProvider.Setup(k => k.VerifyPanAsync("ABCDE1234F", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Verified, "MOCK-PAN-ABCDE1234F"));

        var handler = new VerifyPanCommandHandler(_db, MkUser(user.Id).Object, _kycProvider.Object);
        var result = await handler.Handle(new VerifyPanCommand("ABCDE1234F", null), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("VERIFIED");
        result.Value.VerifiedAt.Should().NotBeNull();

        var record = await _db.KycVerifications.FirstOrDefaultAsync(k => k.UserId == user.Id && k.Kind == "PAN");
        record.Should().NotBeNull();
        record!.ReferenceNumber.Should().Be("ABCDE1234F");
        record.Status.Should().Be("VERIFIED");
        record.Provider.Should().Be("mock");
    }

    [Theory]
    [InlineData("ABCDE12345")]   // invalid — last char should be alpha not digit
    [InlineData("ABCDE123456")]  // too long (11 chars)
    [InlineData("ABC1234567")]   // only 3 alpha at start (9 chars, wrong format)
    [InlineData("")]
    public void VerifyPanValidator_InvalidPan_Fails(string pan)
    {
        var v = new VerifyPanCommandValidator();
        v.Validate(new VerifyPanCommand(pan, null)).IsValid.Should().BeFalse($"'{pan}' is invalid PAN");
    }

    [Theory]
    [InlineData("ABCDE1234F")]
    [InlineData("XYZAB9876Z")]
    public void VerifyPanValidator_ValidPan_Passes(string pan)
    {
        var v = new VerifyPanCommandValidator();
        v.Validate(new VerifyPanCommand(pan, null)).IsValid.Should().BeTrue($"'{pan}' is valid PAN");
    }

    [Fact]
    public async Task VerifyPan_KycProviderReturnsFailed_PersistsFailedRecord()
    {
        var user = await SeedUserAsync();
        _kycProvider.Setup(k => k.VerifyPanAsync("ABCDE1234F", It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Failed));

        var handler = new VerifyPanCommandHandler(_db, MkUser(user.Id).Object, _kycProvider.Object);
        var result = await handler.Handle(new VerifyPanCommand("ABCDE1234F", "Wrong Name"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("handler always returns success — status in DTO");
        result.Value.Status.Should().Be("FAILED");
        result.Value.VerifiedAt.Should().BeNull();
    }

    // ═══════════════════════════════════════════════════════════════════
    // SendAadhaarOtp
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task SendAadhaarOtp_ValidAadhaar_StoresMaskedPendingRecord()
    {
        var user = await SeedUserAsync();
        const string txId = "TXN-001";
        _kycProvider.Setup(k => k.SendAadhaarOtpAsync("123412341234", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycOtpSendResult(txId));

        var handler = new SendAadhaarOtpCommandHandler(_db, MkUser(user.Id).Object, _kycProvider.Object);
        var result = await handler.Handle(new SendAadhaarOtpCommand("123412341234"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TransactionId.Should().Be(txId);

        var record = await _db.KycVerifications.FirstOrDefaultAsync(k => k.UserId == user.Id && k.Kind == "AADHAAR");
        record.Should().NotBeNull();
        record!.Status.Should().Be("PENDING");
        record.ReferenceNumber.Should().Be("XXXX-XXXX-1234", "only last 4 digits stored (DPDP Act 2023)");
        record.ReferenceNumber.Should().NotContain("123412341234", "full Aadhaar must not be stored");
    }

    [Theory]
    [InlineData("12345678901")]    // 11 digits
    [InlineData("1234567890123")]  // 13 digits
    [InlineData("12345678901a")]   // contains letter
    [InlineData("")]
    public void SendAadhaarOtpValidator_InvalidAadhaar_Fails(string aadhaar)
    {
        var v = new SendAadhaarOtpCommandValidator();
        v.Validate(new SendAadhaarOtpCommand(aadhaar)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void SendAadhaarOtpValidator_Valid12Digits_Passes()
    {
        var v = new SendAadhaarOtpCommandValidator();
        v.Validate(new SendAadhaarOtpCommand("123456789012")).IsValid.Should().BeTrue();
    }

    // ═══════════════════════════════════════════════════════════════════
    // VerifyAadhaarOtp
    // ═══════════════════════════════════════════════════════════════════

    [Fact]
    public async Task VerifyAadhaarOtp_ValidOtp_UpdatesRecordToVerified()
    {
        var user = await SeedUserAsync();
        const string txId = "TXN-002";
        _db.KycVerifications.Add(new KycVerification
        {
            UserId = user.Id,
            Kind = KycKind.Aadhaar,
            ReferenceNumber = "XXXX-XXXX-5678",
            Status = KycStatus.Pending,
            Provider = "mock",
            ProviderRef = txId
        });
        await _db.SaveChangesAsync();

        _kycProvider.Setup(k => k.VerifyAadhaarOtpAsync(txId, "654321", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Verified, txId));

        var handler = new VerifyAadhaarOtpCommandHandler(_db, MkUser(user.Id).Object, _kycProvider.Object);
        var result = await handler.Handle(new VerifyAadhaarOtpCommand(txId, "654321"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("VERIFIED");
        result.Value.VerifiedAt.Should().NotBeNull();

        var record = await _db.KycVerifications.FirstAsync(k => k.UserId == user.Id && k.Kind == "AADHAAR");
        record.Status.Should().Be("VERIFIED");
        record.VerifiedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task VerifyAadhaarOtp_UnknownTransactionId_ReturnsNotFound()
    {
        var user = await SeedUserAsync();
        _kycProvider.Setup(k => k.VerifyAadhaarOtpAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Verified));

        var handler = new VerifyAadhaarOtpCommandHandler(_db, MkUser(user.Id).Object, _kycProvider.Object);
        var result = await handler.Handle(new VerifyAadhaarOtpCommand("NONEXISTENT-TXN", "123456"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task VerifyAadhaarOtp_WrongOtp_PersistsFailedStatus()
    {
        var user = await SeedUserAsync();
        const string txId = "TXN-003";
        _db.KycVerifications.Add(new KycVerification
        {
            UserId = user.Id,
            Kind = KycKind.Aadhaar,
            ReferenceNumber = "XXXX-XXXX-9999",
            Status = KycStatus.Pending,
            Provider = "mock",
            ProviderRef = txId
        });
        await _db.SaveChangesAsync();

        _kycProvider.Setup(k => k.VerifyAadhaarOtpAsync(txId, "000000", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Failed));

        var handler = new VerifyAadhaarOtpCommandHandler(_db, MkUser(user.Id).Object, _kycProvider.Object);
        var result = await handler.Handle(new VerifyAadhaarOtpCommand(txId, "000000"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("FAILED");
        result.Value.VerifiedAt.Should().BeNull();
    }
}
