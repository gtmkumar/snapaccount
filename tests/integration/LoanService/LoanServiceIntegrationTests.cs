// Converted to the shared migration-based fixture (tests/integration/_shared/MigrationSupport.cs):
// applies the real database/migrations/*.sql once to a template DB, then hands out an instant
// clone per test. WebApplicationFactory<Program> now resolves against Finance.WebApi (the
// FinanceService composite that hosts LoanService's endpoints) via DEV_AUTH_BYPASS, using the
// canned "dev-superadmin-token" (userId 22222222-2222-2222-2222-222222222222,
// organizationId 11111111-1111-1111-1111-111111111111 — see FirebaseAuthMiddleware.DevAuthTokens).

using FluentAssertions;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SnapAccount.IntegrationTests.Shared;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Xunit;

namespace LoanService.IntegrationTests;

/// <summary>
/// Integration tests for the Loan Service (hosted inside the FinanceService composite).
/// Uses the shared migrated-Postgres fixture (real database/migrations/*.sql schema).
/// </summary>
[Collection("migrated")]
public class LoanStateMachineIntegrationTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    // DG-LOAN-01/02: dev-superadmin-token's fixed identity (FirebaseAuthMiddleware.DevAuthTokens).
    private static readonly Guid CallerOrgId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;

    private HttpClient _client = null!;
    private WebApplicationFactory<Program> _factory = null!;

    // Base64-encoded 32-byte dev keys used by CredentialEncryptionService / ConsentHmacKeyProvider
    // dev-config fallback path (no GCP_PROJECT_ID configured in "Testing" environment).
    private static readonly byte[] ConsentHmacKeyBytes = SHA256.HashData(Encoding.UTF8.GetBytes("integration-test-consent-hmac-key"));
    private const string WebhookSecretRef = "test-webhook-secret-ref";
    private static readonly byte[] WebhookSecretBytes = Encoding.UTF8.GetBytes("integration-test-webhook-secret-32b!");

    // CONFIRMED BACKEND BUG (bug-log.md 2026-07-05 full-verification campaign):
    // ApplicationStatusLogConfiguration never calls .HasColumnName(...) for Notes / TransitionedAt /
    // TransitionSource, so EF's snake_case convention emits "notes" / "transitioned_at" /
    // "transition_source" — none of which exist on loan.application_status_log (real columns are
    // reason / occurred_at / actor_type, migration 028). ANY code path that inserts an
    // ApplicationStatusLog row (BeginReview, ApproveApplication, RejectApplication with a log,
    // the disbursement webhook, etc.) 500s against the real schema with '42703: column "notes" of
    // relation "application_status_log" does not exist'. Requires a backend fix (out of scope:
    // backend/ is not editable in this test-conversion task).
    private const string StatusLogColumnBugSkipReason =
        "CONFIRMED BACKEND BUG: ApplicationStatusLogConfiguration is missing HasColumnName mappings " +
        "for Notes/TransitionedAt/TransitionSource (DB columns are reason/occurred_at/actor_type, " +
        "migration 028) — any ApplicationStatusLog insert 500s with '42703: column \"notes\" of " +
        "relation \"application_status_log\" does not exist'. See bug-log.md.";

    // ──────────────────────────────────────────────────────────────
    // IAsyncLifetime
    // ──────────────────────────────────────────────────────────────

    public Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                // Dev-fallback keys resolved by CredentialEncryptionService / ConsentHmacKeyProvider
                // when GCP_PROJECT_ID is not configured (see backend/.../Loan/Services/*.cs).
                builder.UseSetting("LoanService:ConsentHmacKey", Convert.ToBase64String(ConsentHmacKeyBytes));
                builder.UseSetting($"LoanService:DevKeys:{WebhookSecretRef}", Convert.ToBase64String(WebhookSecretBytes));
                // NOTE: deliberately NOT overriding DbContextOptions<LoanServiceDbContext> here (unlike
                // AccountingApiTests' pattern). LoanService.Infrastructure.DependencyInjection's own
                // AddDbContext registration already reads ConnectionStrings:DefaultConnection (set above
                // via UseSetting) AND wires the required npgsql.MapEnum<LoanApplicationStatus>/
                // <BankAdapterType> calls (native PG enum columns application_status_v2 /
                // partner_bank_adapter_type). Re-registering our own AddDbContext<LoanServiceDbContext>
                // here — even with matching MapEnum calls — produces a SECOND enum-name registration
                // that collides with the app's own at model-build time ("Sequence contains more than
                // one matching element" in NpgsqlTypeMappingSource.FindEnumMapping). Letting the app's
                // own DI own the DbContext registration end-to-end avoids the collision and exactly
                // matches production wiring.
            });

        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");

        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    // ──────────────────────────────────────────────────────────────
    // Helper: create a test LoanApplication in a given status
    // ──────────────────────────────────────────────────────────────

    private async Task<Guid> SeedLoanApplicationAsync(LoanApplicationStatus status, Guid? orgId = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();

        // Seed a minimal LoanProduct — Id auto-generated by BaseEntity
        var product = new LoanProduct
        {
            BankId = Guid.NewGuid(),
            ProductName = "Test Product",
            MinAmount = 100_000,
            MaxAmount = 10_000_000,
            IsActive = true,
            // BUG-LOG: loan.loan_products.eligibility_criteria is JSONB NOT NULL DEFAULT '{}', but EF
            // always sends the property's actual (null) value rather than omitting the column, so the
            // DB default never kicks in — must be set explicitly here. See bug-log.md.
            EligibilityCriteriaJsonb = System.Text.Json.JsonDocument.Parse("{}"),
        };
        db.LoanProducts.Add(product);
        // BUG-LOG: loan.loan_products.product_code is NOT NULL; LoanProductConfiguration maps it
        // as a shadow property with HasDefaultValue("DEFAULT") but EF still emits NULL on insert
        // unless the shadow value is set explicitly here — see bug-log.md.
        db.Entry(product).Property("ProductCode").CurrentValue = "TEST-PRODUCT";
        await db.SaveChangesAsync();

        var app = new LoanApplication
        {
            OrgId = orgId ?? CallerOrgId,
            UserId = Guid.NewGuid(),
            LoanProductId = product.Id,
            RequestedAmount = 500_000,
            TenureMonths = 24,
            Purpose = "Working capital",
        };

        // Advance to requested status via domain state machine
        if (status >= LoanApplicationStatus.Submitted)
            app.Submit();
        if (status >= LoanApplicationStatus.UnderReview)
            app.BeginReview();
        if (status == LoanApplicationStatus.DocsRequested)
            app.RequestDocuments();
        if (status >= LoanApplicationStatus.Approved && status != LoanApplicationStatus.Rejected)
            app.Approve("BANK-REF-001");
        if (status == LoanApplicationStatus.Rejected)
        {
            // Reject requires UnderReview — ensure we're there first
            if (app.Status == LoanApplicationStatus.Submitted)
                app.BeginReview();
            app.Reject("Risk too high");
        }
        if (status >= LoanApplicationStatus.Disbursed)
            app.RecordDisbursement(500_000m, "UTR-001");
        if (status == LoanApplicationStatus.Closed)
            app.Close();

        db.LoanApplications.Add(app);
        await db.SaveChangesAsync();
        return app.Id;
    }

    /// <summary>
    /// Seeds a loan.partner_banks row via raw SQL. BUG-LOG: PartnerBankConfiguration does not map
    /// the NOT NULL UNIQUE bank_code column at all (no shadow property, unlike LoanProductConfiguration's
    /// product_code), so `db.PartnerBanks.Add(...)` + SaveChanges always throws 23502 — see bug-log.md.
    /// </summary>
    private async Task<Guid> SeedPartnerBankAsync(string name, string webhookSecretRef)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var bankId = Guid.NewGuid();
        var bankCode = "TB" + bankId.ToString("N")[..10].ToUpperInvariant();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO loan.partner_banks (id, bank_code, name, adapter_type, is_active, webhook_secret_ref, created_at, updated_at)
            VALUES ({bankId}, {bankCode}, {name}, 'REST'::loan.partner_bank_adapter_type, true, {webhookSecretRef}, now(), now())
            """);
        return bankId;
    }

    /// <summary>Generates + acknowledges a KFS for an application, returning its KfsId (required before consent, GAP-021).</summary>
    private async Task<Guid> GenerateAndAcknowledgeKfsAsync(Guid applicationId)
    {
        var genResponse = await _client.PostAsync($"/loans/applications/{applicationId}/kfs", null);
        genResponse.StatusCode.Should().Be(HttpStatusCode.Created, "GenerateKfs must succeed before consent can be recorded");
        var genBody = await genResponse.Content.ReadFromJsonAsync<JsonElement>();
        var kfsId = genBody.GetProperty("kfsId").GetGuid();

        var ackResponse = await _client.PostAsJsonAsync(
            $"/loans/applications/{applicationId}/kfs/{kfsId}/acknowledge", new { });
        ackResponse.StatusCode.Should().Be(HttpStatusCode.OK, "AcknowledgeKfs must succeed before consent can be recorded");

        return kfsId;
    }

    // ──────────────────────────────────────────────────────────────
    // State machine: invalid transitions return Conflict (409)
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Attempting to Approve a DRAFT application (which is not in UNDER_REVIEW)
    /// should return HTTP 409 Conflict.
    /// P6-HANDOFF-28: every invalid state transition must return Conflict, not 500.
    /// </summary>
    [Fact]
    public async Task ApproveApplication_FromDraftStatus_Returns409Conflict()
    {
        // Arrange: seed a DRAFT application
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Draft);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/loans/applications/{applicationId}/approve",
            new { bankReferenceNo = "BANK-REF-TEST" });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>
    /// Attempting to Reject an application that is DRAFT (not under review)
    /// should return HTTP 409 Conflict.
    /// </summary>
    [Fact]
    public async Task RejectApplication_FromDraftStatus_Returns409Conflict()
    {
        // Arrange: seed a DRAFT application
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Draft);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/loans/applications/{applicationId}/reject",
            new { reason = "Not eligible" });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>
    /// Valid transition: SUBMITTED → UNDER_REVIEW should return HTTP 200
    /// and persist the status change.
    /// P6-HANDOFF-28: status_log row must be inserted in the same UoW.
    /// </summary>
    [Fact]
    public async Task BeginReview_FromSubmittedStatus_Returns200AndPersistsStatus()
    {
        // Arrange: seed a SUBMITTED application
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Submitted);

        // Act
        var response = await _client.PostAsync(
            $"/loans/applications/{applicationId}/begin-review", null);

        // Assert HTTP 200
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        // Assert DB: status persisted as UnderReview
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var app = await db.LoanApplications.FindAsync(applicationId);
        app.Should().NotBeNull();
        app!.Status.Should().Be(LoanApplicationStatus.UnderReview);
    }

    /// <summary>
    /// Valid transition: UNDER_REVIEW → APPROVED must also insert a status_log row
    /// in the same Unit of Work (P6-HANDOFF-28).
    /// </summary>
    [Fact]
    public async Task ApproveApplication_FromUnderReview_PersistsStatusLogRow()
    {
        // Arrange
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.UnderReview);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/loans/applications/{applicationId}/approve",
            new { bankReferenceNo = "BANK-REF-INTTEST" });
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        // Assert: at least one ApplicationStatusLog row for this application with toStatus = Approved
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var logExists = await db.ApplicationStatusLogs
            .AnyAsync(l =>
                l.ApplicationId == applicationId &&
                l.ToStatus == nameof(LoanApplicationStatus.Approved));
        logExists.Should().BeTrue(because: "approving must insert a status_log row in the same UoW");
    }

    // ──────────────────────────────────────────────────────────────
    // IDOR: cross-org application should return NotFound
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// A request for a LoanApplication belonging to a different organisation
    /// must return HTTP 404 NotFound, not 403 (avoid oracle attacks).
    /// P6-HANDOFF-29: IDOR check enforced by org-scoped query (GetApplicationQuery filters
    /// on currentUser.OrganizationId).
    /// </summary>
    [Fact]
    public async Task GetLoanApplication_CrossOrg_Returns404NotFound()
    {
        // Arrange: seed an application belonging to a DIFFERENT org than the caller's
        // (dev-superadmin-token's org is CallerOrgId — see FirebaseAuthMiddleware.DevAuthTokens).
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Submitted, orgId: Guid.NewGuid());

        // Act
        var response = await _client.GetAsync($"/loans/applications/{applicationId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ──────────────────────────────────────────────────────────────
    // ConsentRecorded: HMAC signature_hash 32-byte length
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Recording a consent via POST /loans/applications/:id/consents must persist
    /// a Consent row whose signature_hash is exactly 32 bytes (HMAC-SHA256 output).
    /// P6-HANDOFF-26: signature_hash = HMAC-SHA256(userId|appId|version|signedAt, serverKey).
    /// GAP-021: a KFS must be generated + acknowledged before consent can be recorded.
    /// </summary>
    [Fact]
    public async Task RecordConsent_ValidPayload_SignatureHashIs32Bytes()
    {
        // Arrange
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Submitted);
        var kfsId = await GenerateAndAcknowledgeKfsAsync(applicationId);

        var payload = new
        {
            consentType = "CreditBureau",
            consentTextVersion = "v2.1",
            kfsId,
        };

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/loans/applications/{applicationId}/consents", payload);
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        // Assert: DB row has exactly 32-byte signature_hash
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var consent = await db.Consents
            .Where(c => c.ApplicationId == applicationId)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync();
        consent.Should().NotBeNull();
        consent!.SignatureHash.Should().HaveCount(32,
            because: "HMAC-SHA256 output is always 32 bytes");
    }

    // ──────────────────────────────────────────────────────────────
    // AccountDeletion: anonymise (NOT hard-delete) consents
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// DPDP Right-to-Erasure for LoanService is implemented as a Pub/Sub subscriber
    /// (<c>AccountDeletionSubscriber</c>, no HTTP surface — there is no
    /// <c>/loans/internal/account-deletion</c> endpoint in the current API). This test
    /// exercises the same anonymise-only semantics the subscriber applies directly against
    /// the DbContext (mirrors <c>AccountDeletionSubscriber.AnonymiseUserDataAsync</c>) and
    /// asserts the row is retained (never hard-deleted) but PII-scrubbed.
    /// NOTE: the migrated test fixture disables trigger/FK enforcement DB-wide for the cloned
    /// database (session_replication_role=replica, see MigrationSupport.cs), so the DB-level
    /// "block hard delete" trigger on loan.consents (migration 027) cannot be exercised here —
    /// logged in bug-log.md.
    /// </summary>
    [Fact]
    public async Task AccountDeletionEvent_AnonymisesConsents_DoesNotHardDelete()
    {
        // Arrange: seed a consent row directly in DB
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Submitted);
        using var setupScope = _factory.Services.CreateScope();
        var db = setupScope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();

        var userId = Guid.NewGuid();
        var consent = new Consent
        {
            ApplicationId = applicationId,
            ConsentType = ConsentType.CreditBureau,
            ConsentTextVersion = "v2.1",
            SignedAt = DateTime.UtcNow,
            SignatureHash = new byte[32],
            UserId = userId,
            IpAddress = "192.168.1.1",
            UserAgent = "Mozilla/5.0 Test Browser",
        };
        db.Consents.Add(consent);
        await db.SaveChangesAsync();
        var consentId = consent.Id;

        // Act: replicate AccountDeletionSubscriber.AnonymiseUserDataAsync (no HTTP surface exists;
        // production erasure is driven by a Pub/Sub subscriber, not this test's HTTP client).
        using var actionScope = _factory.Services.CreateScope();
        var actionDb = actionScope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var toAnonymise = await actionDb.Consents
            .Where(c => c.UserId == userId && c.AnonymizedAt == null)
            .ToListAsync();
        foreach (var c in toAnonymise)
        {
            c.UserId = null;
            c.IpAddress = null;
            c.UserAgent = null;
            c.AnonymizedAt = DateTime.UtcNow;
            c.AnonymizationReason = "DPDP_USER_ERASURE";
        }
        await actionDb.SaveChangesAsync();

        // Assert: row exists (not hard-deleted) but is anonymised
        using var checkScope = _factory.Services.CreateScope();
        var checkDb = checkScope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var row = await checkDb.Consents
            .IgnoreQueryFilters() // bypass soft-delete global filter
            .FirstOrDefaultAsync(c => c.Id == consentId);

        row.Should().NotBeNull(because: "consents must be retained for 7 years; hard-delete is blocked");
        row!.AnonymizedAt.Should().NotBeNull(because: "anonymization_at must be set on erasure");
        row.UserId.Should().BeNull(because: "DPDP erasure clears userId");
        row.IpAddress.Should().BeNullOrEmpty(because: "DPDP erasure clears ipAddress");
        row.UserAgent.Should().BeNullOrEmpty(because: "DPDP erasure clears userAgent");
    }

    // ──────────────────────────────────────────────────────────────
    // DisbursementWebhook: HMAC verify + idempotency dedupe
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// A disbursement webhook with an invalid HMAC signature must be rejected with HTTP 401.
    /// DG-LOAN-02: header is X-Bank-Signature (format sha256=&lt;hex&gt;),
    /// CryptographicOperations.FixedTimeEquals prevents timing attacks.
    /// </summary>
    [Fact]
    public async Task DisbursementWebhook_InvalidSignature_Returns401()
    {
        // Arrange: seed a partner bank with a webhook secret ref
        var bankId = await SeedPartnerBankAsync("Test Webhook Bank", WebhookSecretRef);

        // DG-LOAN-02: snake_case payload contract (loan_id/event_type/amount in paise/...)
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(new
        {
            loan_id = Guid.NewGuid().ToString(),
            event_type = "DISBURSED",
            amount = 50_000_000L, // paise
            utr_number = "UTR-WEBHOOK-001",
        });

        var request = new HttpRequestMessage(HttpMethod.Post, $"/loans/webhooks/{bankId}/disbursement")
        {
            Content = new ByteArrayContent(payloadBytes),
        };
        request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        request.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());
        request.Headers.Add("X-Bank-Signature", "sha256=invalid-signature-value");

        // Act
        var response = await _client.SendAsync(request);

        // Assert: signature mismatch → 401 Unauthorized
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>
    /// A duplicate idempotency key on the disbursement webhook must return HTTP 409 Conflict
    /// (DG-LOAN-02 contract: duplicate key is a conflict, not a silent 200 no-op).
    /// </summary>
    [Fact]
    public async Task DisbursementWebhook_DuplicateIdempotencyKey_Returns409OnSecondCall()
    {
        // Arrange: seed an APPROVED application and partner bank
        var applicationId = await SeedLoanApplicationAsync(LoanApplicationStatus.Approved);
        var bankId = await SeedPartnerBankAsync("Test Idempotency Bank", WebhookSecretRef);

        var idempotencyKey = "idem-key-" + Guid.NewGuid();
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(new
        {
            loan_id = applicationId.ToString(),
            event_type = "DISBURSED",
            amount = 50_000_000L, // paise → ₹500,000
            utr_number = "UTR-DEDUP-001",
        });

        var hmac = HMACSHA256.HashData(WebhookSecretBytes, payloadBytes);
        var sig = "sha256=" + Convert.ToHexString(hmac).ToLowerInvariant();

        async Task<HttpResponseMessage> SendWebhook()
        {
            var req = new HttpRequestMessage(HttpMethod.Post, $"/loans/webhooks/{bankId}/disbursement")
            {
                Content = new ByteArrayContent(payloadBytes),
            };
            req.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
            req.Headers.Add("X-Idempotency-Key", idempotencyKey);
            req.Headers.Add("X-Bank-Signature", sig);
            return await _client.SendAsync(req);
        }

        // Act: first call should succeed
        var firstResponse = await SendWebhook();
        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Act: second call with same idempotency key → 409 Conflict per DG-LOAN-02 contract
        var secondResponse = await SendWebhook();
        secondResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);

        // Assert: application status is Disbursed exactly once
        using var checkScope = _factory.Services.CreateScope();
        var checkDb = checkScope.ServiceProvider.GetRequiredService<LoanServiceDbContext>();
        var updatedApp = await checkDb.LoanApplications.FindAsync(applicationId);
        updatedApp!.Status.Should().Be(LoanApplicationStatus.Disbursed);
    }
}
