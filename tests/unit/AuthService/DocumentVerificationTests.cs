using AuthService.Application.Documents.Commands.ConfirmDocumentOtp;
using AuthService.Application.Documents.Commands.SaveDocument;
using AuthService.Application.Documents.Commands.SendDocumentOtp;
using AuthService.Application.Documents.Queries.ListDocuments;
using AuthService.Application.Interfaces;
using AuthService.Application.Organizations.Queries.GetVerificationPolicy;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for Part B — document save, OTP send/confirm, list, and verification policy.
/// Uses EF Core InMemory + mocked IDocumentVerificationProvider.
/// </summary>
[Trait("Category", "Unit")]
public sealed class DocumentVerificationTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Mock<IDocumentVerificationProvider> _provider;

    public DocumentVerificationTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
        _provider = new Mock<IDocumentVerificationProvider>();
    }

    public void Dispose() => _db.Dispose();

    private static Mock<ICurrentUser> MkUser(Guid id)
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(id);
        return m;
    }

    private async Task<(User user, Organization org)> SeedUserWithOrgAsync(bool govEnabled)
    {
        var user = new User { Email = $"doc{Guid.NewGuid():N}@test.com" };
        _db.Users.Add(user);

        var role = Role.Create("OWNER", "Owner", isSystemRole: true);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync();

        var org = new Organization
        {
            BusinessName = "TestCo",
            OwnerUserId  = user.Id
            // IsActive defaults to true via private setter initialized to true
        };
        if (govEnabled) org.SetGovernmentVerification(true);
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        var member = OrganizationMember.Create(org.Id, user.Id, role.Id);
        _db.OrganizationMembers.Add(member);
        await _db.SaveChangesAsync();

        return (user, org);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GetVerificationPolicy
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetVerificationPolicy_OrgFlagTrue_ReturnsTrue()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        var handler = new GetVerificationPolicyQueryHandler(_db, MkUser(user.Id).Object);

        var result = await handler.Handle(new GetVerificationPolicyQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.GovernmentVerificationEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task GetVerificationPolicy_OrgFlagFalse_ReturnsFalse()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);
        var handler = new GetVerificationPolicyQueryHandler(_db, MkUser(user.Id).Object);

        var result = await handler.Handle(new GetVerificationPolicyQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.GovernmentVerificationEnabled.Should().BeFalse();
    }

    [Fact]
    public async Task GetVerificationPolicy_NoOrg_ReturnsFalse()
    {
        var user = new User { Email = "noorg@test.com" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var handler = new GetVerificationPolicyQueryHandler(_db, MkUser(user.Id).Object);
        var result  = await handler.Handle(new GetVerificationPolicyQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.GovernmentVerificationEnabled.Should().BeFalse("no org → permissive default");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SaveDocument (gov-verification OFF)
    // ═══════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("pan",     "ABCDE1234F", "ABCDE1234F")]
    [InlineData("PAN",     "XYZAB9876Z", "XYZAB9876Z")]
    [InlineData("gstin",   "29ABCDE1234F1Z5", "29ABCDE1234F1Z5")]
    [InlineData("tan",     "PNES03028F", "PNES03028F")]
    public async Task SaveDocument_GovOff_ValidDoc_SavesWithStatusSaved(
        string kind, string number, string expectedRef)
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);
        var handler = new SaveDocumentCommandHandler(_db, MkUser(user.Id).Object);

        var result = await handler.Handle(
            new SaveDocumentCommand(kind, number), CancellationToken.None);

        result.IsSuccess.Should().BeTrue($"kind={kind} number={number} should be valid");
        result.Value.Status.Should().Be(KycStatus.Saved);
        result.Value.ReferenceNumber.Should().Be(expectedRef);

        var record = await _db.KycVerifications
            .FirstOrDefaultAsync(k => k.UserId == user.Id && k.Kind == KycKind.Parse(kind));
        record.Should().NotBeNull();
        record!.Status.Should().Be(KycStatus.Saved);
    }

    [Fact]
    public async Task SaveDocument_GovOff_Aadhaar_MasksAndSavesSaved()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);
        var handler = new SaveDocumentCommandHandler(_db, MkUser(user.Id).Object);

        var result = await handler.Handle(
            new SaveDocumentCommand("aadhaar", "123412341234"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(KycStatus.Saved);
        result.Value.ReferenceNumber.Should().Be("XXXX-XXXX-1234");
        result.Value.ReferenceNumber.Should().NotContain("123412341234", "full Aadhaar must not be stored");
    }

    [Fact]
    public async Task SaveDocument_GovOn_ValidDoc_SavesWithStatusPending()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        var handler = new SaveDocumentCommandHandler(_db, MkUser(user.Id).Object);

        var result = await handler.Handle(
            new SaveDocumentCommand("pan", "ABCDE1234F"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(KycStatus.Pending);
    }

    [Fact]
    public async Task SaveDocument_Upsert_SoftDeletesExistingRecord()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);
        var handler = new SaveDocumentCommandHandler(_db, MkUser(user.Id).Object);

        // First save
        await handler.Handle(new SaveDocumentCommand("pan", "ABCDE1234F"), CancellationToken.None);

        // Second save (upsert)
        var result = await handler.Handle(
            new SaveDocumentCommand("pan", "XYZAB9876Z"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        // First record should be soft-deleted — use IgnoreQueryFilters to bypass the
        // global soft-delete filter so we can see both records
        var records = await _db.KycVerifications
            .IgnoreQueryFilters()
            .Where(k => k.UserId == user.Id && k.Kind == KycKind.Pan)
            .ToListAsync();

        records.Should().HaveCount(2, "old record soft-deleted, new one inserted");
        records.Count(r => r.DeletedAt != null).Should().Be(1, "exactly one soft-deleted");
        records.Count(r => r.DeletedAt == null).Should().Be(1, "exactly one active");
        records.Single(r => r.DeletedAt == null).ReferenceNumber.Should().Be("XYZAB9876Z");
    }

    // ── Validator ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("pan",     "ABCDE12345")]     // last char digit
    [InlineData("aadhaar", "12345678901")]    // 11 digits
    [InlineData("gstin",   "INVALID")]
    [InlineData("tan",     "ABCD1234567")]    // too long
    [InlineData("unknown", "ABCDE1234F")]     // unknown kind
    public void SaveDocumentValidator_InvalidInputs_Fail(string kind, string number)
    {
        var v = new SaveDocumentCommandValidator();
        v.Validate(new SaveDocumentCommand(kind, number)).IsValid.Should().BeFalse();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SendDocumentOtp
    // ═══════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("pan",     "ABCDE1234F")]
    [InlineData("aadhaar", "123456789012")]
    [InlineData("gstin",   "29ABCDE1234F1Z5")]
    [InlineData("tan",     "PNES03028F")]
    public async Task SendDocumentOtp_ValidDoc_DispatchesOtpAndReturnsTxId(
        string kind, string number)
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        _provider
            .Setup(p => p.SendOtpAsync(
                KycKind.Parse(kind)!, number, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycOtpSendResult($"TXN-{kind.ToUpper()}-001"));

        var handler = new SendDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        var result  = await handler.Handle(new SendDocumentOtpCommand(kind, number), CancellationToken.None);

        result.IsSuccess.Should().BeTrue($"kind={kind}");
        result.Value.TransactionId.Should().StartWith("TXN-");

        var record = await _db.KycVerifications
            .FirstOrDefaultAsync(k => k.UserId == user.Id && k.Kind == KycKind.Parse(kind) && k.DeletedAt == null);
        record.Should().NotBeNull();
        record!.Status.Should().Be(KycStatus.Pending);
    }

    [Fact]
    public async Task SendDocumentOtp_Aadhaar_StoresMaskedRef()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        const string aadhaar = "123456789012";
        _provider
            .Setup(p => p.SendOtpAsync(KycKind.Aadhaar, aadhaar, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycOtpSendResult("TXN-AADHAAR-001"));

        var handler = new SendDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        await handler.Handle(new SendDocumentOtpCommand("aadhaar", aadhaar), CancellationToken.None);

        var record = await _db.KycVerifications
            .FirstOrDefaultAsync(k => k.UserId == user.Id && k.Kind == KycKind.Aadhaar && k.DeletedAt == null);
        record!.ReferenceNumber.Should().Be("XXXX-XXXX-9012");
        record.ReferenceNumber.Should().NotContain(aadhaar, "full Aadhaar must not be stored");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ConfirmDocumentOtp
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task ConfirmDocumentOtp_ValidOtp_UpdatesToVerified()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        const string txId = "TXN-PAN-VERIFY";

        _db.KycVerifications.Add(new KycVerification
        {
            UserId          = user.Id,
            Kind            = KycKind.Pan,
            ReferenceNumber = "ABCDE1234F",
            Status          = KycStatus.Pending,
            Provider        = "mock",
            ProviderRef     = txId
        });
        await _db.SaveChangesAsync();

        _provider
            .Setup(p => p.VerifyOtpAsync(KycKind.Pan, txId, "123456", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Verified, txId));

        var handler = new ConfirmDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        var result  = await handler.Handle(
            new ConfirmDocumentOtpCommand("pan", txId, "123456"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(KycStatus.Verified);
        result.Value.OtpAccepted.Should().BeTrue();
        result.Value.VerifiedAt.Should().NotBeNull();

        var record = await _db.KycVerifications
            .FirstAsync(k => k.UserId == user.Id && k.Kind == KycKind.Pan && k.DeletedAt == null);
        record.Status.Should().Be(KycStatus.Verified);
        record.VerifiedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task ConfirmDocumentOtp_WrongOtp_LeavesPending_DoesNotPersistFailure()
    {
        // Product rule: wrong OTP = user error. Record stays PENDING (retryable).
        // FAILED is reserved for provider rejection of the document number itself.
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        const string txId = "TXN-GSTIN-BAD";

        _db.KycVerifications.Add(new KycVerification
        {
            UserId          = user.Id,
            Kind            = KycKind.Gstin,
            ReferenceNumber = "29ABCDE1234F1Z5",
            Status          = KycStatus.Pending,
            Provider        = "mock",
            ProviderRef     = txId
        });
        await _db.SaveChangesAsync();

        _provider
            .Setup(p => p.VerifyOtpAsync(KycKind.Gstin, txId, "000000", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Failed));

        var handler = new ConfirmDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        var result  = await handler.Handle(
            new ConfirmDocumentOtpCommand("gstin", txId, "000000"), CancellationToken.None);

        // Response: no hard-block, status reported as PENDING (not FAILED)
        result.IsSuccess.Should().BeTrue("handler always returns — no hard block");
        result.Value.Status.Should().Be(KycStatus.Pending, "wrong OTP leaves doc PENDING, not FAILED");
        result.Value.OtpAccepted.Should().BeFalse();
        result.Value.VerifiedAt.Should().BeNull();

        // Persistence: record is still PENDING — not written to FAILED
        var record = await _db.KycVerifications
            .FirstAsync(k => k.UserId == user.Id && k.Kind == KycKind.Gstin && k.DeletedAt == null);
        record.Status.Should().Be(KycStatus.Pending, "DB record must stay PENDING after wrong OTP");
        record.VerifiedAt.Should().BeNull();
    }

    [Fact]
    public async Task ConfirmDocumentOtp_WrongOtp_TransactionRemainsValid_RetrySucceeds()
    {
        // After a wrong OTP the same transactionId must still be usable for a correct retry.
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        const string txId = "TXN-TAN-RETRY";

        _db.KycVerifications.Add(new KycVerification
        {
            UserId          = user.Id,
            Kind            = KycKind.Tan,
            ReferenceNumber = "PNES03028F",
            Status          = KycStatus.Pending,
            Provider        = "mock",
            ProviderRef     = txId
        });
        await _db.SaveChangesAsync();

        _provider
            .Setup(p => p.VerifyOtpAsync(KycKind.Tan, txId, "000000", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Failed));
        _provider
            .Setup(p => p.VerifyOtpAsync(KycKind.Tan, txId, "123456", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Verified, txId));

        var handler = new ConfirmDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);

        // First attempt — wrong OTP
        var first = await handler.Handle(
            new ConfirmDocumentOtpCommand("tan", txId, "000000"), CancellationToken.None);
        first.IsSuccess.Should().BeTrue();
        first.Value.Status.Should().Be(KycStatus.Pending);
        first.Value.OtpAccepted.Should().BeFalse();

        // Second attempt — correct OTP using the SAME transactionId
        var second = await handler.Handle(
            new ConfirmDocumentOtpCommand("tan", txId, "123456"), CancellationToken.None);
        second.IsSuccess.Should().BeTrue();
        second.Value.Status.Should().Be(KycStatus.Verified);
        second.Value.OtpAccepted.Should().BeTrue();
        second.Value.VerifiedAt.Should().NotBeNull();

        var record = await _db.KycVerifications
            .FirstAsync(k => k.UserId == user.Id && k.Kind == KycKind.Tan && k.DeletedAt == null);
        record.Status.Should().Be(KycStatus.Verified);
        record.VerifiedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task ConfirmDocumentOtp_WrongOtp_ThenResend_ThenCorrectOtp_Verifies()
    {
        // Full retry sequence: send -> wrong confirm -> fresh send (supersedes) -> correct confirm -> VERIFIED.
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        const string firstTxId  = "TXN-PAN-FIRST";
        const string secondTxId = "TXN-PAN-SECOND";
        const string docNumber  = "ABCDE1234F";

        // Seed the initial PENDING record (as if otp/send was already called)
        _db.KycVerifications.Add(new KycVerification
        {
            UserId          = user.Id,
            Kind            = KycKind.Pan,
            ReferenceNumber = docNumber,
            Status          = KycStatus.Pending,
            Provider        = "mock",
            ProviderRef     = firstTxId
        });
        await _db.SaveChangesAsync();

        // Mock: first txId wrong, second txId correct
        _provider
            .Setup(p => p.VerifyOtpAsync(KycKind.Pan, firstTxId, "000000", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Failed));
        _provider
            .Setup(p => p.SendOtpAsync(KycKind.Pan, docNumber, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycOtpSendResult(secondTxId));
        _provider
            .Setup(p => p.VerifyOtpAsync(KycKind.Pan, secondTxId, "999999", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new KycVerifyResult(KycStatus.Verified, secondTxId));

        var confirmHandler = new ConfirmDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        var sendHandler    = new SendDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);

        // Step 1: wrong OTP on first transaction — doc stays PENDING
        var wrongConfirm = await confirmHandler.Handle(
            new ConfirmDocumentOtpCommand("pan", firstTxId, "000000"), CancellationToken.None);
        wrongConfirm.Value.Status.Should().Be(KycStatus.Pending);
        wrongConfirm.Value.OtpAccepted.Should().BeFalse();

        // Step 2: user requests a fresh OTP — supersedes the previous transaction
        var resend = await sendHandler.Handle(
            new SendDocumentOtpCommand("pan", docNumber), CancellationToken.None);
        resend.IsSuccess.Should().BeTrue();
        resend.Value.TransactionId.Should().Be(secondTxId);

        // After resend, there should be one active PENDING record (the new one) and one soft-deleted
        var allRecords = await _db.KycVerifications
            .IgnoreQueryFilters()
            .Where(k => k.UserId == user.Id && k.Kind == KycKind.Pan)
            .ToListAsync();
        allRecords.Should().HaveCount(2);
        allRecords.Count(r => r.DeletedAt == null).Should().Be(1, "only the new transaction is active");
        allRecords.Single(r => r.DeletedAt == null).ProviderRef.Should().Be(secondTxId);

        // Step 3: correct OTP on new transaction -> VERIFIED
        var correctConfirm = await confirmHandler.Handle(
            new ConfirmDocumentOtpCommand("pan", secondTxId, "999999"), CancellationToken.None);
        correctConfirm.IsSuccess.Should().BeTrue();
        correctConfirm.Value.Status.Should().Be(KycStatus.Verified);
        correctConfirm.Value.OtpAccepted.Should().BeTrue();
        correctConfirm.Value.VerifiedAt.Should().NotBeNull();

        // Old txId is now dead (its record is soft-deleted) — confirm on it returns NotFound
        var staleConfirm = await confirmHandler.Handle(
            new ConfirmDocumentOtpCommand("pan", firstTxId, "000000"), CancellationToken.None);
        staleConfirm.IsFailure.Should().BeTrue("old transaction superseded by resend");
        staleConfirm.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task ConfirmDocumentOtp_UnknownTransactionId_ReturnsNotFound()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);

        var handler = new ConfirmDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        var result  = await handler.Handle(
            new ConfirmDocumentOtpCommand("pan", "NONEXISTENT-TXN", "123456"), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task ConfirmDocumentOtp_WrongKindForTxId_ReturnsNotFound()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: true);
        const string txId = "TXN-TAN-KIND";

        _db.KycVerifications.Add(new KycVerification
        {
            UserId          = user.Id,
            Kind            = KycKind.Tan,
            ReferenceNumber = "PNES03028F",
            Status          = KycStatus.Pending,
            Provider        = "mock",
            ProviderRef     = txId
        });
        await _db.SaveChangesAsync();

        // Confirm with wrong kind "pan" even though txId belongs to "tan"
        var handler = new ConfirmDocumentOtpCommandHandler(_db, MkUser(user.Id).Object, _provider.Object);
        var result  = await handler.Handle(
            new ConfirmDocumentOtpCommand("pan", txId, "123456"), CancellationToken.None);

        result.IsFailure.Should().BeTrue("kind mismatch should return NotFound");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ListDocuments
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task ListDocuments_ReturnsAllActiveRecords()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);

        _db.KycVerifications.AddRange(
            new KycVerification
            {
                UserId = user.Id, Kind = KycKind.Pan, ReferenceNumber = "ABCDE1234F",
                Status = KycStatus.Saved, Provider = "mock"
            },
            new KycVerification
            {
                UserId = user.Id, Kind = KycKind.Tan, ReferenceNumber = "PNES03028F",
                Status = KycStatus.Saved, Provider = "mock"
            });
        await _db.SaveChangesAsync();

        var handler = new ListDocumentsQueryHandler(_db, MkUser(user.Id).Object);
        var result  = await handler.Handle(new ListDocumentsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);
        result.Value.Should().Contain(d => d.Kind == KycKind.Pan);
        result.Value.Should().Contain(d => d.Kind == KycKind.Tan);
    }

    [Fact]
    public async Task ListDocuments_DoesNotReturnSoftDeletedRecords()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);

        _db.KycVerifications.Add(new KycVerification
        {
            UserId = user.Id, Kind = KycKind.Pan, ReferenceNumber = "ABCDE1234F",
            Status = KycStatus.Saved, Provider = "mock",
            DeletedAt = DateTime.UtcNow.AddMinutes(-5)
        });
        await _db.SaveChangesAsync();

        var handler = new ListDocumentsQueryHandler(_db, MkUser(user.Id).Object);
        var result  = await handler.Handle(new ListDocumentsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeEmpty("soft-deleted records excluded");
    }

    [Fact]
    public async Task ListDocuments_AadhaarRecord_ReturnsMaskedRef()
    {
        var (user, _) = await SeedUserWithOrgAsync(govEnabled: false);

        _db.KycVerifications.Add(new KycVerification
        {
            UserId = user.Id, Kind = KycKind.Aadhaar, ReferenceNumber = "XXXX-XXXX-1234",
            Status = KycStatus.Saved, Provider = "mock"
        });
        await _db.SaveChangesAsync();

        var handler = new ListDocumentsQueryHandler(_db, MkUser(user.Id).Object);
        var result  = await handler.Handle(new ListDocumentsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Single().ReferenceNumber.Should().Be("XXXX-XXXX-1234");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MockDocumentVerificationProvider
    // ═══════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(KycKind.Pan)]
    [InlineData(KycKind.Aadhaar)]
    [InlineData(KycKind.Gstin)]
    [InlineData(KycKind.Tan)]
    public async Task MockDocumentVerificationProvider_SendOtp_ReturnsTransactionId(string kind)
    {
        var provider = new AuthService.Infrastructure.Services.MockDocumentVerificationProvider(
            NullLogger<AuthService.Infrastructure.Services.MockDocumentVerificationProvider>.Instance);

        var result = await provider.SendOtpAsync(kind, "ABCDE1234F");
        result.TransactionId.Should().NotBeNullOrEmpty();
        result.TransactionId.Should().Contain(kind, "transactionId embeds kind for traceability");
    }

    [Fact]
    public async Task MockDocumentVerificationProvider_VerifyOtp_OtpSixZeroes_Fails()
    {
        var provider = new AuthService.Infrastructure.Services.MockDocumentVerificationProvider(
            NullLogger<AuthService.Infrastructure.Services.MockDocumentVerificationProvider>.Instance);

        var result = await provider.VerifyOtpAsync(KycKind.Pan, "TXN-001", "000000");
        result.Status.Should().Be(KycStatus.Failed);
    }

    [Fact]
    public async Task MockDocumentVerificationProvider_VerifyOtp_NonZeroOtp_Succeeds()
    {
        var provider = new AuthService.Infrastructure.Services.MockDocumentVerificationProvider(
            NullLogger<AuthService.Infrastructure.Services.MockDocumentVerificationProvider>.Instance);

        var result = await provider.VerifyOtpAsync(KycKind.Pan, "TXN-001", "123456");
        result.Status.Should().Be(KycStatus.Verified);
    }

    // ── Confirm OTP validators ────────────────────────────────────────────────

    [Fact]
    public void ConfirmDocumentOtpValidator_MissingTransactionId_Fails()
    {
        var v = new ConfirmDocumentOtpCommandValidator();
        v.Validate(new ConfirmDocumentOtpCommand("pan", "", "123456")).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ConfirmDocumentOtpValidator_MissingOtp_Fails()
    {
        var v = new ConfirmDocumentOtpCommandValidator();
        v.Validate(new ConfirmDocumentOtpCommand("pan", "TXN-001", "")).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ConfirmDocumentOtpValidator_InvalidKind_Fails()
    {
        var v = new ConfirmDocumentOtpCommandValidator();
        v.Validate(new ConfirmDocumentOtpCommand("badkind", "TXN-001", "123456")).IsValid.Should().BeFalse();
    }
}
