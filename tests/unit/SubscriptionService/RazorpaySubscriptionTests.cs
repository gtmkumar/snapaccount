// Unit tests: B9 — Subscription Service: Razorpay config, usage metering, trial logic.
//
// DG-SUB-02 additions (IRazorpayClient wired into handlers):
//   SubscribeCommandHandler:
//     23. Paid plan with RazorpayPlanId → calls CreateSubscriptionAsync, persists returned ID
//     24. Free plan (PriceInr=0) → skips CreateSubscriptionAsync
//     25. Plan has no RazorpayPlanId → skips CreateSubscriptionAsync
//     26. Razorpay call throws → subscription still saved locally (non-fatal)
//
//   CreatePlanCommandHandler:
//     27. Paid plan → calls SyncPlanAsync, persists returned RazorpayPlanId on plan
//     28. Free plan (PriceInr=0) → skips SyncPlanAsync
//     29. SyncPlanAsync throws → plan saved locally without RazorpayPlanId (non-fatal)
//
// Covers:
//   AesCredentialEncryptionService (AES-256-GCM):
//     1. Encrypt → Decrypt round-trip returns original plaintext
//     2. Tamper with ciphertext → CryptographicException on decrypt
//     3. Two Encrypt calls produce different ciphertexts (random nonce)
//     4. Wrong key → CryptographicException
//     5. Invalid base64-encoded key length → InvalidOperationException
//
//   UpdateRazorpayConfigCommand validator:
//     6. Valid rzp_live_ prefix key passes
//     7. Valid rzp_test_ prefix key passes
//     8. Invalid prefix → rejected
//     9. Empty KeyId → rejected
//     10. Empty KeySecret → rejected
//
//   UpdateRazorpayConfigCommandHandler:
//     11. Creates new config row when none exists
//     12. Updates existing config row (upsert)
//     13. KeySecret is stored encrypted (not plaintext)
//
//   RecordUsageCommandHandler:
//     14. Valid feature code → persists row with correct fields
//     15. Usage record has correct billing period (1st to end of month)
//
//   RecordUsageCommandValidator:
//     16. Invalid feature code rejected
//     17. Units=0 rejected
//     18. Units=10001 rejected
//
//   Subscription entity trial-period logic:
//     19. TrialDays > 0 → Status = Trialing, CurrentPeriodEnd = now + trialDays
//     20. TrialDays = 0 → Status = Active, CurrentPeriodEnd = now + 30 days
//     21. Trial expiry boundary: Activate transitions to Active with new period end
//     22. Cancel from Trialing → sets CancelledAt

using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Application.Config.Commands.UpdateRazorpayConfig;
using SubscriptionService.Application.Plans.Commands.CreatePlan;
using SubscriptionService.Application.Subscriptions.Commands.Subscribe;
using SubscriptionService.Application.Usage.Commands.RecordUsage;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;
using SubscriptionService.Infrastructure.Persistence;
using SubscriptionService.Infrastructure.Services;
using Xunit;

namespace SubscriptionService.Tests;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

file static class SubTestDb
{
    public static SubscriptionServiceDbContext Create()
    {
        var opts = new DbContextOptionsBuilder<SubscriptionServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new SubscriptionServiceDbContext(opts);
    }
}

file static class AesKeyConfig
{
    public static IConfiguration With32ByteKey()
    {
        var key32 = RandomNumberGenerator.GetBytes(32);
        var keyB64 = Convert.ToBase64String(key32);
        return new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>("ENCRYPTION_KEY", keyB64)])
            .Build();
    }

    public static AesCredentialEncryptionService Service()
        => new(With32ByteKey());
}

// ────────────────────────────────────────────────────────────────────────────
// 1. AES-256-GCM encryption round-trip and tamper detection
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class AesGcmEncryptionTests
{
    [Theory]
    [InlineData("rzp_live_abc123")]
    [InlineData("rzp_test_xyz789")]
    [InlineData("some-webhook-secret-very-long-key-material")]
    [InlineData("")]  // empty string round-trips
    public void RoundTrip_EncryptDecrypt_ReturnsOriginalPlaintext(string plaintext)
    {
        var svc = AesKeyConfig.Service();
        var cipher = svc.Encrypt(plaintext);
        var decrypted = svc.Decrypt(cipher);

        decrypted.Should().Be(plaintext, $"round-trip must return original for input '{plaintext}'");
    }

    [Fact]
    public void Encrypt_TwoCalls_ProduceDifferentCiphertexts()
    {
        var svc = AesKeyConfig.Service();
        var c1 = svc.Encrypt("rzp_live_secret");
        var c2 = svc.Encrypt("rzp_live_secret");

        c1.Should().NotBe(c2, "random nonce means each encrypt call produces a unique ciphertext");
    }

    [Fact]
    public void Tampered_Ciphertext_ThrowsCryptographicException()
    {
        var svc = AesKeyConfig.Service();
        var cipher = svc.Encrypt("sensitive-secret");

        // Flip a byte in the ciphertext region
        var raw = Convert.FromBase64String(cipher);
        raw[^1] ^= 0xFF;  // flip last byte (ciphertext area)
        var tampered = Convert.ToBase64String(raw);

        var act = () => svc.Decrypt(tampered);
        act.Should().Throw<CryptographicException>("GCM authentication tag mismatch must throw");
    }

    [Fact]
    public void WrongKey_Decrypt_ThrowsCryptographicException()
    {
        var svc1 = AesKeyConfig.Service();
        var svc2 = AesKeyConfig.Service();  // different key

        var cipher = svc1.Encrypt("razorpay-secret-key");

        var act = () => svc2.Decrypt(cipher);
        act.Should().Throw<CryptographicException>("wrong key cannot decrypt GCM ciphertext");
    }

    [Fact]
    public void ShortKey_ThrowsInvalidOperation()
    {
        var shortKey = Convert.ToBase64String(new byte[16]); // 16 bytes, not 32
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>("ENCRYPTION_KEY", shortKey)])
            .Build();

        var act = () => new AesCredentialEncryptionService(config);
        act.Should().Throw<InvalidOperationException>("key must be exactly 32 bytes for AES-256");
    }

    [Fact]
    public void MissingKey_ThrowsInvalidOperation()
    {
        var config = new ConfigurationBuilder().Build();  // no key at all

        var act = () => new AesCredentialEncryptionService(config);
        act.Should().Throw<InvalidOperationException>("missing ENCRYPTION_KEY must throw loudly");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. UpdateRazorpayConfigCommand validator
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class UpdateRazorpayConfigValidatorTests
{
    private readonly UpdateRazorpayConfigCommandValidator _v = new();

    [Theory]
    [InlineData("rzp_live_abc123", "secret123", true)]
    [InlineData("rzp_test_abc123", "secret456", true)]
    [InlineData("rzp_LIVE_abc123", "secret123", true)]  // case-insensitive prefix check
    [InlineData("rzp_invalid_abc", "secret123", false)]
    [InlineData("razorpay_live_abc", "secret123", false)]
    [InlineData("", "secret123", false)]
    [InlineData("rzp_live_abc123", "", false)]
    public void Validator_KeyId_And_KeySecret_Scenarios(string keyId, string keySecret, bool valid)
    {
        var result = _v.Validate(new UpdateRazorpayConfigCommand(keyId, keySecret, null, true, false));
        result.IsValid.Should().Be(valid, $"keyId={keyId}, keySecret.Length={keySecret.Length}");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. UpdateRazorpayConfigCommandHandler
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class UpdateRazorpayConfigHandlerTests : IDisposable
{
    private readonly SubscriptionServiceDbContext _db = SubTestDb.Create();
    private readonly AesCredentialEncryptionService _encryption = AesKeyConfig.Service();

    public void Dispose() => _db.Dispose();

    private UpdateRazorpayConfigCommandHandler Handler()
        => new(_db, _encryption);

    [Fact]
    public async Task Handle_NoExistingConfig_CreatesNewRow()
    {
        var cmd = new UpdateRazorpayConfigCommand("rzp_test_key123", "webhook-secret", "wh-secret", true, true);
        var result = await Handler().Handle(cmd, default);

        result.IsSuccess.Should().BeTrue();

        var config = await _db.RazorpayConfigs.FirstOrDefaultAsync();
        config.Should().NotBeNull();
        config!.KeyId.Should().Be("rzp_test_key123");
        config.TestMode.Should().BeTrue();
        config.IsEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_ExistingConfig_UpdatesInPlace()
    {
        // Pre-seed a config
        await Handler().Handle(
            new UpdateRazorpayConfigCommand("rzp_test_old", "old_secret", null, true, false),
            default);

        // Update it
        var result = await Handler().Handle(
            new UpdateRazorpayConfigCommand("rzp_live_new", "new_secret", "wh", false, true),
            default);

        result.IsSuccess.Should().BeTrue();

        var configs = await _db.RazorpayConfigs.Where(c => c.DeletedAt == null).ToListAsync();
        configs.Should().HaveCount(1, "upsert must NOT create a duplicate row");
        configs[0].KeyId.Should().Be("rzp_live_new");
        configs[0].IsEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_KeySecret_IsNotStoredAsPlaintext()
    {
        var plainSecret = "rzp_super_secret_key_material_v1";
        await Handler().Handle(
            new UpdateRazorpayConfigCommand("rzp_test_abc", plainSecret, null, true, false),
            default);

        var config = await _db.RazorpayConfigs.FirstAsync();
        config.EncryptedKeySecret.Should().NotBe(plainSecret,
            "secret must be stored encrypted, never as plaintext");
        // The encrypted form should be a valid base64 blob that decrypts back
        var decrypted = _encryption.Decrypt(config.EncryptedKeySecret);
        decrypted.Should().Be(plainSecret, "the stored encrypted value must decrypt back to the original");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. RecordUsageCommandHandler and validator
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class RecordUsageValidatorTests
{
    private readonly RecordUsageCommandValidator _v = new();

    [Theory]
    [InlineData("document.upload", 1, true)]
    [InlineData("ai.call", 5, true)]
    [InlineData("chat.session", 1, true)]
    [InlineData("invalid.feature", 1, false)]
    [InlineData("document.upload", 0, false)]     // units must be > 0
    [InlineData("document.upload", 10001, false)] // units ceiling
    [InlineData("", 1, false)]                    // empty code
    public void Validator_Scenarios(string featureCode, int units, bool valid)
    {
        var result = _v.Validate(new RecordUsageCommand(Guid.NewGuid(), featureCode, units));
        result.IsValid.Should().Be(valid, $"featureCode={featureCode}, units={units}");
    }

    [Fact]
    public void Validator_EmptyOrgId_Rejected()
    {
        var result = _v.Validate(new RecordUsageCommand(Guid.Empty, "ai.call", 1));
        result.IsValid.Should().BeFalse();
    }
}

[Trait("Category", "Unit")]
public sealed class RecordUsageHandlerTests : IDisposable
{
    private readonly SubscriptionServiceDbContext _db = SubTestDb.Create();

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Handle_ValidUsage_PersistsRowWithCorrectFields()
    {
        var orgId = Guid.NewGuid();
        var correlationId = "doc_" + Guid.NewGuid().ToString("N");
        var handler = new RecordUsageCommandHandler(_db);

        var result = await handler.Handle(
            new RecordUsageCommand(orgId, "document.upload", 3, correlationId), default);

        result.IsSuccess.Should().BeTrue();

        var row = await _db.UsageRecords.FirstOrDefaultAsync(r => r.OrgId == orgId);
        row.Should().NotBeNull();
        row!.FeatureCode.Should().Be("document.upload");
        row.Units.Should().Be(3);
        row.CorrelationId.Should().Be(correlationId);
        row.OrgId.Should().Be(orgId);
    }

    [Fact]
    public async Task Handle_UsageRecord_HasCorrectBillingPeriod()
    {
        var handler = new RecordUsageCommandHandler(_db);
        await handler.Handle(new RecordUsageCommand(Guid.NewGuid(), "ai.call", 1), default);

        var row = await _db.UsageRecords.FirstAsync();
        var now = DateTime.UtcNow;

        row.PeriodStart.Day.Should().Be(1, "billing period starts on 1st of the month");
        row.PeriodStart.Month.Should().Be(now.Month);
        row.PeriodStart.Year.Should().Be(now.Year);
        row.PeriodEnd.Month.Should().Be(now.Month);
        row.PeriodEnd.Day.Should().Be(DateTime.DaysInMonth(now.Year, now.Month),
            "billing period ends on last day of the month");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Subscription entity trial-period logic
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class SubscriptionTrialPeriodTests
{
    [Fact]
    public void Create_WithTrialDays_StartsAsTrialing()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 14);

        sub.Status.Should().Be(SubscriptionStatus.Trialing);
        sub.CurrentPeriodEnd.Should().BeCloseTo(DateTime.UtcNow.AddDays(14), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Create_WithZeroTrialDays_StartsAsActive()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.Status.Should().Be(SubscriptionStatus.Active,
            "zero trial days → immediately active, no trial period");
        sub.CurrentPeriodEnd.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Activate_TransitionsToActive_WithNewPeriodEnd()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 7);
        sub.Status.Should().Be(SubscriptionStatus.Trialing);

        var newPeriodEnd = DateTime.UtcNow.AddDays(30);
        sub.Activate(newPeriodEnd);

        sub.Status.Should().Be(SubscriptionStatus.Active, "Activate transitions trialing → active");
        sub.CurrentPeriodEnd.Should().Be(newPeriodEnd);
    }

    [Fact]
    public void TrialExpiryBoundary_DaysAtBoundary()
    {
        // Trial of 0 days → should be ACTIVE immediately (not TRIALING with a past period)
        var subZero = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);
        subZero.Status.Should().Be(SubscriptionStatus.Active);
        subZero.CurrentPeriodEnd.Should().BeAfter(DateTime.UtcNow,
            "period end must be in the future even for zero-trial");

        // Trial of 1 day → TRIALING with period end ~24h from now
        var subOneDay = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 1);
        subOneDay.Status.Should().Be(SubscriptionStatus.Trialing);
        subOneDay.CurrentPeriodEnd.Should().BeCloseTo(DateTime.UtcNow.AddDays(1), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Cancel_FromTrialing_SetsCancelledAtAndStatus()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 30);
        sub.Cancel();

        sub.Status.Should().Be(SubscriptionStatus.Cancelled);
        sub.CancelledAt.Should().NotBeNull();
        sub.CancelledAt!.Value.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Renew_SetsActiveWithNewPeriodEnd()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);
        var nextPeriodEnd = DateTime.UtcNow.AddDays(30);
        sub.Renew(nextPeriodEnd);

        sub.Status.Should().Be(SubscriptionStatus.Active);
        sub.CurrentPeriodEnd.Should().Be(nextPeriodEnd);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. DG-SUB-02: SubscribeCommandHandler wires IRazorpayClient
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class SubscribeCommandHandlerRazorpayTests : IDisposable
{
    private readonly SubscriptionServiceDbContext _db = SubTestDb.Create();

    public void Dispose() => _db.Dispose();

    private static ICurrentUser MockUser(Guid orgId)
    {
        var m = new Mock<ICurrentUser>();
        m.Setup(x => x.OrganizationId).Returns(orgId);
        m.Setup(x => x.UserId).Returns(Guid.NewGuid());
        return m.Object;
    }

    private SubscribeCommandHandler BuildHandler(IRazorpayClient razorpay)
        => new(_db, MockUser(Guid.NewGuid()), razorpay,
               NullLogger<SubscribeCommandHandler>.Instance);

    private async Task<Plan> SeedPaidPlan(decimal price = 999m, string? razorpayPlanId = "rplan_test123")
    {
        var plan = Plan.Create("Pro Monthly", PlanTier.Growth, BillingCycle.Monthly, price, 0);
        if (razorpayPlanId is not null) plan.SetRazorpayPlanId(razorpayPlanId);
        _db.Plans.Add(plan);
        await _db.SaveChangesAsync(default);
        return plan;
    }

    [Fact]
    public async Task Handle_PaidPlanWithRazorpayId_CallsCreateSubscriptionAsync_AndPersistsId()
    {
        var plan = await SeedPaidPlan();

        var razorpayMock = new Mock<IRazorpayClient>();
        razorpayMock
            .Setup(r => r.CreateSubscriptionAsync(
                plan.RazorpayPlanId!, It.IsAny<int>(),
                It.IsAny<Dictionary<string, string>?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RazorpaySubscriptionResult(
                "sub_xyz123", "created", 0, 0, "https://rzp.io/xyz"));

        // Wire handler with its own org id
        var orgId = Guid.NewGuid();
        var user = new Mock<ICurrentUser>();
        user.Setup(u => u.OrganizationId).Returns(orgId);
        user.Setup(u => u.UserId).Returns(Guid.NewGuid());

        var handler = new SubscribeCommandHandler(
            _db, user.Object, razorpayMock.Object,
            NullLogger<SubscribeCommandHandler>.Instance);

        var result = await handler.Handle(new SubscribeCommand(plan.Id), default);

        result.IsSuccess.Should().BeTrue();
        result.Value.RazorpaySubscriptionId.Should().Be("sub_xyz123",
            "the Razorpay subscription ID must be persisted after a successful CreateSubscriptionAsync call");

        razorpayMock.Verify(r => r.CreateSubscriptionAsync(
            plan.RazorpayPlanId!, 0,
            It.IsAny<Dictionary<string, string>?>(), It.IsAny<CancellationToken>()), Times.Once);

        var saved = await _db.Subscriptions.FirstOrDefaultAsync(s => s.OrganizationId == orgId);
        saved!.RazorpaySubscriptionId.Should().Be("sub_xyz123");
    }

    [Fact]
    public async Task Handle_FreePlan_SkipsCreateSubscriptionAsync()
    {
        var plan = Plan.Create("Free", PlanTier.Free, BillingCycle.Monthly, 0m, 0);
        _db.Plans.Add(plan);
        await _db.SaveChangesAsync(default);

        var razorpayMock = new Mock<IRazorpayClient>();

        var orgId = Guid.NewGuid();
        var user = new Mock<ICurrentUser>();
        user.Setup(u => u.OrganizationId).Returns(orgId);
        user.Setup(u => u.UserId).Returns(Guid.NewGuid());

        var handler = new SubscribeCommandHandler(
            _db, user.Object, razorpayMock.Object,
            NullLogger<SubscribeCommandHandler>.Instance);

        var result = await handler.Handle(new SubscribeCommand(plan.Id), default);

        result.IsSuccess.Should().BeTrue();
        razorpayMock.Verify(
            r => r.CreateSubscriptionAsync(
                It.IsAny<string>(), It.IsAny<int>(),
                It.IsAny<Dictionary<string, string>?>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "free plan (PriceInr=0) must NOT call Razorpay API");
    }

    [Fact]
    public async Task Handle_PlanWithNoRazorpayPlanId_SkipsCreateSubscriptionAsync()
    {
        var plan = await SeedPaidPlan(price: 999m, razorpayPlanId: null);

        var razorpayMock = new Mock<IRazorpayClient>();

        var orgId = Guid.NewGuid();
        var user = new Mock<ICurrentUser>();
        user.Setup(u => u.OrganizationId).Returns(orgId);
        user.Setup(u => u.UserId).Returns(Guid.NewGuid());

        var handler = new SubscribeCommandHandler(
            _db, user.Object, razorpayMock.Object,
            NullLogger<SubscribeCommandHandler>.Instance);

        var result = await handler.Handle(new SubscribeCommand(plan.Id), default);

        result.IsSuccess.Should().BeTrue("plan is still subscribable even without a Razorpay plan ID");
        razorpayMock.Verify(
            r => r.CreateSubscriptionAsync(
                It.IsAny<string>(), It.IsAny<int>(),
                It.IsAny<Dictionary<string, string>?>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "no RazorpayPlanId on the plan → skip Razorpay API call");
    }

    [Fact]
    public async Task Handle_RazorpayThrows_SubscriptionStillSavedLocally()
    {
        var plan = await SeedPaidPlan();

        var razorpayMock = new Mock<IRazorpayClient>();
        razorpayMock
            .Setup(r => r.CreateSubscriptionAsync(
                It.IsAny<string>(), It.IsAny<int>(),
                It.IsAny<Dictionary<string, string>?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Razorpay API unreachable"));

        var orgId = Guid.NewGuid();
        var user = new Mock<ICurrentUser>();
        user.Setup(u => u.OrganizationId).Returns(orgId);
        user.Setup(u => u.UserId).Returns(Guid.NewGuid());

        var handler = new SubscribeCommandHandler(
            _db, user.Object, razorpayMock.Object,
            NullLogger<SubscribeCommandHandler>.Instance);

        // Should NOT propagate the Razorpay exception
        var result = await handler.Handle(new SubscribeCommand(plan.Id), default);

        result.IsSuccess.Should().BeTrue(
            "Razorpay API failure must not prevent local subscription creation");

        var saved = await _db.Subscriptions.FirstOrDefaultAsync(s => s.OrganizationId == orgId);
        saved.Should().NotBeNull("subscription row must be persisted even when Razorpay call fails");
        saved!.RazorpaySubscriptionId.Should().BeNull(
            "no Razorpay ID should be set when the API call failed");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 7. DG-SUB-02: CreatePlanCommandHandler wires SyncPlanAsync
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class CreatePlanCommandHandlerRazorpayTests : IDisposable
{
    private readonly SubscriptionServiceDbContext _db = SubTestDb.Create();

    public void Dispose() => _db.Dispose();

    private CreatePlanCommandHandler BuildHandler(IRazorpayClient razorpay)
        => new(_db, razorpay, NullLogger<CreatePlanCommandHandler>.Instance);

    [Fact]
    public async Task Handle_PaidPlan_CallsSyncPlanAsync_AndPersistsRazorpayPlanId()
    {
        var razorpayMock = new Mock<IRazorpayClient>();
        razorpayMock
            .Setup(r => r.SyncPlanAsync(
                "Pro Monthly", It.IsAny<long>(), "monthly", 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RazorpayPlanResult("rplan_abc123", "Pro Monthly", 99900L, "monthly", 1));

        var cmd = new CreatePlanCommand("Pro Monthly", PlanTier.Growth, BillingCycle.Monthly, 999m, 0);
        var result = await BuildHandler(razorpayMock.Object).Handle(cmd, default);

        result.IsSuccess.Should().BeTrue();
        result.Value.RazorpayPlanId.Should().Be("rplan_abc123",
            "the Razorpay plan ID returned by SyncPlanAsync must be included in the response");

        // Verify it was persisted on the plan entity
        var plan = await _db.Plans.FirstOrDefaultAsync();
        plan!.RazorpayPlanId.Should().Be("rplan_abc123",
            "RazorpayPlanId must be stored on the Plan entity for future subscription creation");

        razorpayMock.Verify(r => r.SyncPlanAsync(
            "Pro Monthly", 99900L, "monthly", 1, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_FreePlan_SkipsSyncPlanAsync()
    {
        var razorpayMock = new Mock<IRazorpayClient>();

        var cmd = new CreatePlanCommand("Free", PlanTier.Free, BillingCycle.Monthly, 0m, 0);
        var result = await BuildHandler(razorpayMock.Object).Handle(cmd, default);

        result.IsSuccess.Should().BeTrue();
        razorpayMock.Verify(
            r => r.SyncPlanAsync(
                It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "free plan (PriceInr=0) must NOT call Razorpay SyncPlanAsync");

        var plan = await _db.Plans.FirstOrDefaultAsync();
        plan!.RazorpayPlanId.Should().BeNull(
            "free plan should have no Razorpay plan ID");
    }

    [Fact]
    public async Task Handle_SyncPlanThrows_PlanStillSavedLocally()
    {
        var razorpayMock = new Mock<IRazorpayClient>();
        razorpayMock
            .Setup(r => r.SyncPlanAsync(
                It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Razorpay unreachable"));

        var cmd = new CreatePlanCommand("Pro Monthly", PlanTier.Growth, BillingCycle.Monthly, 999m, 0);
        var result = await BuildHandler(razorpayMock.Object).Handle(cmd, default);

        result.IsSuccess.Should().BeTrue(
            "Razorpay sync failure must not prevent local plan creation");

        var plan = await _db.Plans.FirstOrDefaultAsync();
        plan.Should().NotBeNull("plan must be saved locally even when Razorpay sync fails");
        plan!.Name.Should().Be("Pro Monthly");
        plan.RazorpayPlanId.Should().BeNull(
            "no Razorpay plan ID should be set when SyncPlanAsync failed");
    }

    [Fact]
    public async Task Handle_QuarterlyPlan_MapsToMonthlyWithInterval3()
    {
        var razorpayMock = new Mock<IRazorpayClient>();
        razorpayMock
            .Setup(r => r.SyncPlanAsync(
                It.IsAny<string>(), It.IsAny<long>(), "monthly", 3, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RazorpayPlanResult("rplan_qtr", "Pro Quarterly", 299700L, "monthly", 3));

        var cmd = new CreatePlanCommand("Pro Quarterly", PlanTier.Growth, BillingCycle.Quarterly, 2997m, 0);
        await BuildHandler(razorpayMock.Object).Handle(cmd, default);

        razorpayMock.Verify(r => r.SyncPlanAsync(
            "Pro Quarterly", 299700L, "monthly", 3, It.IsAny<CancellationToken>()), Times.Once,
            "Quarterly billing cycle must map to period='monthly', interval=3 on Razorpay");
    }

    [Fact]
    public async Task Handle_AnnualPlan_MapsToYearlyPeriod()
    {
        var razorpayMock = new Mock<IRazorpayClient>();
        razorpayMock
            .Setup(r => r.SyncPlanAsync(
                It.IsAny<string>(), It.IsAny<long>(), "yearly", 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RazorpayPlanResult("rplan_annual", "Pro Annual", 999900L, "yearly", 1));

        var cmd = new CreatePlanCommand("Pro Annual", PlanTier.Growth, BillingCycle.Annual, 9999m, 0);
        await BuildHandler(razorpayMock.Object).Handle(cmd, default);

        razorpayMock.Verify(r => r.SyncPlanAsync(
            "Pro Annual", 999900L, "yearly", 1, It.IsAny<CancellationToken>()), Times.Once,
            "Annual billing cycle must map to period='yearly', interval=1 on Razorpay");
    }
}
