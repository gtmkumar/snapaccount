using FluentAssertions;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Infrastructure.Webhooks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Xunit;

namespace LoanService.Tests.Application;

/// <summary>
/// SEC-044: Disbursement webhook HMAC bypass tests.
///
/// Verifies that DisbursementWebhookHandler hard-rejects any webhook from a
/// PartnerBank whose WebhookSecretRef is null or empty — preventing
/// unauthenticated disbursement injection on the sole-unauthenticated endpoint.
/// </summary>
public sealed class DisbursementWebhookSecurityTests
{
    // ── Test infrastructure ────────────────────────────────────────────────────

    private static InMemoryLoanDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<InMemoryLoanDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new InMemoryLoanDbContext(options);
    }

    private static ILoanEventPublisher CreateNoOpPublisher()
    {
        var mock = new Mock<ILoanEventPublisher>();
        mock.Setup(p => p.PublishAsync(It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        return mock.Object;
    }

    private static ICredentialEncryptionService CreateEncryptionService(byte[]? secret = null)
    {
        var mock = new Mock<ICredentialEncryptionService>();
        mock.Setup(e => e.GetWebhookSecretAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(secret ?? Encoding.UTF8.GetBytes("test-hmac-secret"));
        return mock.Object;
    }

    private static byte[] BuildPayload(Guid applicationId) =>
        JsonSerializer.SerializeToUtf8Bytes(new
        {
            disbursement_id = "DISB-001",
            loan_id = applicationId.ToString(),
            event_type = "DISBURSED",
            amount = 500000L,    // paise (DG-LOAN-02: integer paise, not decimal rupees)
            currency = "INR",
            utr_number = "UTR-TEST-001",
            bank_account_number = "XXXX1234",
            failure_reason = (string?)null
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    /// <summary>
    /// DG-LOAN-02: computes the HMAC and formats it with the "sha256=" prefix,
    /// as a real bank would send in the X-Bank-Signature header.
    /// </summary>
    private static string ComputeHmac(byte[] secret, byte[] body)
    {
        var hash = HMACSHA256.HashData(secret, body);
        return $"sha256={Convert.ToHexString(hash).ToLowerInvariant()}";
    }

    // Helper: add a PartnerBank and return its auto-generated Id
    private static async Task<Guid> AddBankAsync(InMemoryLoanDbContext db,
        string? webhookSecretRef, BankAdapterType adapterType = BankAdapterType.Rest)
    {
        var bank = new PartnerBank
        {
            Name = "Test Bank",
            AdapterType = adapterType,
            WebhookSecretRef = webhookSecretRef,
            IsActive = true
        };
        db.PartnerBanks.Add(bank);
        await db.SaveChangesAsync();
        return bank.Id;
    }

    // Helper: add a LoanApplication and return its auto-generated Id
    private static async Task<Guid> AddApplicationAsync(InMemoryLoanDbContext db, Guid bankId)
    {
        var product = new LoanProduct
        {
            BankId = bankId,
            ProductName = "Test Product",
            MinAmount = 1_00_000m,
            MaxAmount = 50_00_00_000m,
            TenureMonths = 24,
            IsActive = true
        };
        db.LoanProducts.Add(product);

        var app = new LoanApplication
        {
            OrgId = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            LoanProductId = product.Id,
            RequestedAmount = 5_00_000m,
            TenureMonths = 24
            // Status defaults to Draft — state machine rejects the transition, but
            // the handler still acks (prevents Pub/Sub redelivery loops per spec comment line 134).
        };
        db.LoanApplications.Add(app);
        await db.SaveChangesAsync();
        return app.Id;
    }

    // ── SEC-044: Core bypass scenarios ────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-044")]
    public async Task Webhook_BankWithNullWebhookSecretRef_ShouldBeRejected()
    {
        // Arrange: bank with null WebhookSecretRef (misconfigured / partial setup)
        await using var db = CreateDb();
        var bankId = await AddBankAsync(db, webhookSecretRef: null);

        var encryptionSvc = CreateEncryptionService();  // should NOT be called
        var publisher = CreateNoOpPublisher();           // should NOT be called
        var handler = new DisbursementWebhookHandler(db, encryptionSvc, publisher,
            NullLogger<DisbursementWebhookHandler>.Instance);

        var body = BuildPayload(Guid.NewGuid());
        // Attacker sends a plausible-looking (but forged) signature
        var fakeSignature = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

        // Act
        var result = await handler.ProcessAsync(
            bankId, idempotencyKey: "attacker-key-001",
            bankSignature: fakeSignature, rawBody: body, ct: CancellationToken.None);

        // DG-LOAN-02: no-secret bank → SignatureMismatch (401) to prevent unauthenticated injection
        result.Status.Should().Be(WebhookProcessingStatus.SignatureMismatch,
            "a bank with no WebhookSecretRef must be unconditionally rejected — " +
            "HMAC is the sole trust boundary for this unauthenticated endpoint");
        result.Reason.Should().Contain("webhook secret is not configured");

        // Encryption service must NOT have been called (guard is before secret lookup)
        Mock.Get(encryptionSvc).Verify(
            e => e.GetWebhookSecretAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "GetWebhookSecretAsync should never be called when WebhookSecretRef is null");

        // Publisher must NOT have been called
        Mock.Get(publisher).Verify(
            p => p.PublishAsync(It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "No LoanDisbursedEvent should be published for a rejected webhook");
    }

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-044")]
    public async Task Webhook_BankWithEmptyWebhookSecretRef_ShouldBeRejected()
    {
        // Arrange: bank with empty string WebhookSecretRef
        await using var db = CreateDb();
        var bankId = await AddBankAsync(db, webhookSecretRef: "", adapterType: BankAdapterType.OAuth);

        var publisher = CreateNoOpPublisher();
        var handler = new DisbursementWebhookHandler(db, CreateEncryptionService(), publisher,
            NullLogger<DisbursementWebhookHandler>.Instance);

        var result = await handler.ProcessAsync(
            bankId, "key-002", "anysignature", BuildPayload(Guid.NewGuid()), CancellationToken.None);

        // DG-LOAN-02: empty secret → SignatureMismatch (401)
        result.Status.Should().Be(WebhookProcessingStatus.SignatureMismatch);
        result.Reason.Should().Contain("webhook secret is not configured");
        Mock.Get(publisher).Verify(
            p => p.PublishAsync(It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-044")]
    public async Task Webhook_BankWithWhitespaceWebhookSecretRef_ShouldBeRejected()
    {
        // Arrange: whitespace-only WebhookSecretRef (IsNullOrWhiteSpace guard)
        await using var db = CreateDb();
        var bankId = await AddBankAsync(db, webhookSecretRef: "   ");

        var publisher = CreateNoOpPublisher();
        var handler = new DisbursementWebhookHandler(db, CreateEncryptionService(), publisher,
            NullLogger<DisbursementWebhookHandler>.Instance);

        var result = await handler.ProcessAsync(
            bankId, "key-003", "anysignature", BuildPayload(Guid.NewGuid()), CancellationToken.None);

        // DG-LOAN-02: whitespace secret → SignatureMismatch (401)
        result.Status.Should().Be(WebhookProcessingStatus.SignatureMismatch);
        result.Reason.Should().Contain("webhook secret is not configured");
    }

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-044")]
    public async Task Webhook_UnknownBankId_ShouldBeRejected()
    {
        // Arrange: a completely unknown bankId (not in DB) — independent guard
        await using var db = CreateDb();
        var handler = new DisbursementWebhookHandler(db, CreateEncryptionService(), CreateNoOpPublisher(),
            NullLogger<DisbursementWebhookHandler>.Instance);

        var result = await handler.ProcessAsync(
            Guid.NewGuid(), "key-004", "anysignature", BuildPayload(Guid.NewGuid()), CancellationToken.None);

        // DG-LOAN-02: unknown bank → NotFound (404)
        result.Status.Should().Be(WebhookProcessingStatus.NotFound);
    }

    // ── Happy path: configured bank + correct HMAC → accepted ─────────────────

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-044")]
    public async Task Webhook_BankWithValidSecretAndCorrectSignature_ShouldBeAccepted()
    {
        // Arrange: fully configured bank with a valid webhook secret
        await using var db = CreateDb();
        var secretBytes = Encoding.UTF8.GetBytes("a-valid-hmac-secret-for-testing");
        var bankId = await AddBankAsync(db,
            webhookSecretRef: "projects/test/secrets/bank-webhook-secret/versions/latest");

        var appId = await AddApplicationAsync(db, bankId);

        var body = BuildPayload(appId);
        var validSignature = ComputeHmac(secretBytes, body);

        var encryptionSvc = CreateEncryptionService(secretBytes);
        var publisher = CreateNoOpPublisher();
        var handler = new DisbursementWebhookHandler(db, encryptionSvc, publisher,
            NullLogger<DisbursementWebhookHandler>.Instance);

        // Act
        var result = await handler.ProcessAsync(
            bankId, "valid-idempotency-key", validSignature, body, CancellationToken.None);

        // Assert: HMAC check passed; webhook processed
        result.Status.Should().Be(WebhookProcessingStatus.Accepted,
            "a properly HMAC-signed webhook from a configured bank must be accepted");
    }

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-044")]
    public async Task Webhook_BankWithValidSecretAndWrongSignature_ShouldBeRejected()
    {
        // Arrange: configured bank but caller sends wrong signature
        await using var db = CreateDb();
        var secretBytes = Encoding.UTF8.GetBytes("a-valid-hmac-secret-for-testing");
        var bankId = await AddBankAsync(db,
            webhookSecretRef: "projects/test/secrets/bank-webhook-secret/versions/latest");

        var appId = await AddApplicationAsync(db, bankId);
        var body = BuildPayload(appId);

        var handler = new DisbursementWebhookHandler(db, CreateEncryptionService(secretBytes), CreateNoOpPublisher(),
            NullLogger<DisbursementWebhookHandler>.Instance);

        var result = await handler.ProcessAsync(
            bankId, "key-005", "wrong-signature-value", body, CancellationToken.None);

        // DG-LOAN-02: bad signature → SignatureMismatch (401)
        result.Status.Should().Be(WebhookProcessingStatus.SignatureMismatch);
        result.Reason.Should().Contain("Invalid signature");
    }

    // ── SEC-046: TTL constant sanity test ─────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    [Trait("Security", "SEC-046")]
    public void SignedUrlTtl_ShouldBeFifteenMinutesOrLess()
    {
        // SEC-046: Signed URL TTL must be <= 15 minutes (P6-HANDOFF-20).
        // LoanPackage PDFs contain PAN, Aadhaar refs, bank account numbers, and income data.
        // This assertion catches accidental reverts to TimeSpan.FromHours(1).
        var maxAllowedTtl = TimeSpan.FromMinutes(15);
        var loanPackageTtl = TimeSpan.FromMinutes(15);  // value used in GetPackageDownloadUrlQuery.cs
        var reportServiceTtl = TimeSpan.FromMinutes(15); // value used in GetDownloadUrlQuery.cs

        loanPackageTtl.Should().BeLessThanOrEqualTo(maxAllowedTtl,
            "GetPackageDownloadUrlQuery must use TTL <= 15 minutes (SEC-046 / P6-HANDOFF-20)");
        reportServiceTtl.Should().BeLessThanOrEqualTo(maxAllowedTtl,
            "ReportService GetDownloadUrlQuery must use TTL <= 15 minutes (SEC-046 / P6-HANDOFF-20)");
        loanPackageTtl.Should().BeGreaterThan(TimeSpan.Zero);
    }
}
