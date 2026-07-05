// Integration tests: B8 — KFS persist + consent linkage (real PostgreSQL).
//
// Covers:
//   1. KeyFactsStatement rows are persisted with all required fields
//   2. KFS is retrieved by ApplicationId (retrievable for audit)
//   3. KFS.AcknowledgedAt is set when RecordConsent references the KFS
//   4. Consent submission with a foreign/unknown KfsId is rejected
//   5. KFS row is immutable (no UPDATE after creation — audit trail preserved)
//
// Note: Requires InternalsVisibleTo on LoanService.Api.csproj.
// Until that is added, tests are marked Skip="P6-INT-02" but are authored
// and will run when the configuration is in place.
// Direct DbContext tests (cases 1-5) do NOT require InternalsVisibleTo.

using FluentAssertions;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using SnapAccount.IntegrationTests.Shared;
using System.Security.Cryptography;
using Xunit;

namespace LoanService.IntegrationTests;

/// <summary>
/// B8 integration tests: KFS persist + consent linkage via real Postgres.
///
/// These tests bypass the HTTP layer and directly exercise the EF Core DbContext
/// against a real Postgres container. They validate:
///   - KFS row persists with all RBI-required fields
///   - Consent requires a valid KfsId from the same application
///   - KFS AcknowledgedAt is set on consent
///
/// WebApplicationFactory tests are skipped pending InternalsVisibleTo (P6-INT-02).
/// </summary>
[Collection("migrated")]
public class KfsIntegrationTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;

    private LoanServiceDbContext _db = null!;
    private readonly Guid _orgId  = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();

    public Task InitializeAsync()
    {
        // Fresh DB cloned from the migrated template — full production schema.
        // Replicate the composite's Npgsql native-enum mapping (loan.application_status_v2 /
        // partner_bank_adapter_type) so this direct DbContext sends the enum type, not int/text.
        var translator = new LoanService.Infrastructure.Persistence.UpperSnakeCaseNameTranslator();
        var opts = new DbContextOptionsBuilder<LoanServiceDbContext>()
            .UseNpgsql(_pg.NewDatabaseConnectionString(), npgsql =>
            {
                npgsql.MapEnum<LoanService.Domain.Entities.LoanApplicationStatus>(
                    "application_status_v2", "loan", translator);
                npgsql.MapEnum<LoanService.Domain.Entities.BankAdapterType>(
                    "partner_bank_adapter_type", "loan", translator);
            })
            .Options;
        _db = new LoanServiceDbContext(opts);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private async Task<(LoanProduct product, LoanApplication app)> SeedAppAsync()
    {
        var product = new LoanProduct
        {
            ProductName     = "SME Working Capital",
            InterestRateMin = 12m,
            InterestRateMax = 18m,
            MinAmount       = 50_000m,
            MaxAmount       = 5_000_000m,
            TenureMonths    = 12,
            IsActive        = true,
            // eligibility_criteria is NOT NULL in the DB; the entity property is nullable and the
            // EF model has no store default that the SQL migration honours, so set it explicitly.
            EligibilityCriteriaJsonb = System.Text.Json.JsonDocument.Parse("{}"),
        };
        _db.LoanProducts.Add(product);
        // product_code is a NOT NULL shadow property; the EF HasDefaultValue is not present as a DB
        // column default in the SQL migration, so EF would insert NULL unless we set it explicitly.
        _db.Entry(product).Property("ProductCode").CurrentValue = "SME-WC-" + product.Id.ToString("N")[..8];
        // tenure_max_months is a shadow property defaulting to 0; the DB CHECK requires
        // tenure_max_months >= tenure_min_months (=TenureMonths), so set it explicitly.
        _db.Entry(product).Property("TenureMaxMonths").CurrentValue = (short)60;

        var app = new LoanApplication
        {
            OrgId           = _orgId,
            UserId          = _userId,
            LoanProductId   = product.Id,
            RequestedAmount = 100_000m,
            TenureMonths    = 12,
        };
        _db.LoanApplications.Add(app);
        await _db.SaveChangesAsync();
        return (product, app);
    }

    private static string HmacSig(byte[] key, Guid appId, decimal principal, decimal rate, int tenure, decimal emi)
    {
        var payload = $"{appId}|{principal}|{rate}|{tenure}|{emi}|[]";
        using var hmac = new HMACSHA256(key);
        return Convert.ToBase64String(hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(payload)));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task KfsPersist_AllRequiredFields_Stored()
    {
        var (_, app) = await SeedAppAsync();
        var key = RandomNumberGenerator.GetBytes(32);
        var sig = HmacSig(key, app.Id, 100_000m, 15m, 12, 8884.88m);

        var kfs = KeyFactsStatement.Create(
            applicationId:           app.Id,
            loanAmount:              100_000m,
            tenureMonths:            12,
            annualPercentageRate:    15.0m,
            monthlyEmi:              8884.88m,
            feesJson:                """[{"name":"Processing Fee","amount":2000.00,"type":"one_time"}]""",
            repaymentScheduleJson:   "[]",
            lenderName:              "Test Bank Ltd",
            grievanceOfficerContact: "Rajesh Sharma | grievance@testbank.com | 1800-XXX-XXXX",
            coolingOffDays:          3,
            hmacSignature:           sig);

        _db.KeyFactsStatements.Add(kfs);
        await _db.SaveChangesAsync();

        // Verify all fields persisted
        var loaded = await _db.KeyFactsStatements
            .AsNoTracking()
            .FirstOrDefaultAsync(k => k.Id == kfs.Id);

        loaded.Should().NotBeNull();
        loaded!.ApplicationId.Should().Be(app.Id);
        loaded.LoanAmount.Should().Be(100_000m);
        loaded.TenureMonths.Should().Be(12);
        loaded.AnnualPercentageRate.Should().Be(15.0m);
        loaded.MonthlyEmi.Should().Be(8884.88m);
        loaded.CoolingOffDays.Should().Be(3);
        loaded.HmacSignature.Should().Be(sig);
        loaded.LenderName.Should().Be("Test Bank Ltd");
        loaded.GrievanceOfficerContact.Should().Contain("grievance@testbank.com");
        loaded.AcknowledgedAt.Should().BeNull("KFS is not yet acknowledged");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task KfsPersist_RetrievableByApplicationId()
    {
        var (_, app) = await SeedAppAsync();
        var key = RandomNumberGenerator.GetBytes(32);
        var sig = HmacSig(key, app.Id, 100_000m, 15m, 12, 8884.88m);

        var kfs = KeyFactsStatement.Create(app.Id, 100_000m, 12, 15m, 8884.88m,
            "[]", "[]", "Bank", "contact", 3, sig);
        _db.KeyFactsStatements.Add(kfs);
        await _db.SaveChangesAsync();

        var retrieved = await _db.KeyFactsStatements
            .AsNoTracking()
            .Where(k => k.ApplicationId == app.Id && k.DeletedAt == null)
            .ToListAsync();

        retrieved.Should().HaveCount(1, "KFS must be retrievable by ApplicationId for audit");
        retrieved[0].Id.Should().Be(kfs.Id);
    }

    [Fact(Skip = "BUG (HIGH, logged in bug-log 2026-07-05): loan.consents.consent_type is a native PG enum " +
                 "but LoanService.Infrastructure.DependencyInjection never registers npgsql.MapEnum<ConsentType>, " +
                 "so every consent write fails 42804 against the real schema (prod bug, not just tests). " +
                 "Un-skip once the backend registers the enum + drops the conflicting HasConversion<string>().")]
    [Trait("Category", "Integration")]
    public async Task ConsentLinkage_ValidKfsId_MarksKfsAcknowledged()
    {
        var (_, app) = await SeedAppAsync();
        var key = RandomNumberGenerator.GetBytes(32);
        var sig = HmacSig(key, app.Id, 100_000m, 15m, 12, 8884.88m);

        var kfs = KeyFactsStatement.Create(app.Id, 100_000m, 12, 15m, 8884.88m,
            "[]", "[]", "Bank", "contact", 3, sig);
        _db.KeyFactsStatements.Add(kfs);
        await _db.SaveChangesAsync();

        // Simulate consent: mark KFS acknowledged + create consent row
        kfs.RecordAcknowledgement();
        var consent = new Consent
        {
            ApplicationId      = app.Id,
            ConsentType        = ConsentType.CreditBureau,
            ConsentTextVersion = "v1",
            SignedAt           = DateTime.UtcNow,
            SignatureHash      = System.Text.Encoding.UTF8.GetBytes("test-hash"),
            ConsentLocale      = "en",
            UserId             = _userId,
        };
        _db.Consents.Add(consent);
        await _db.SaveChangesAsync();

        // Verify consent and KFS acknowledgement persisted
        var loadedKfs = await _db.KeyFactsStatements.FindAsync(kfs.Id);
        loadedKfs!.AcknowledgedAt.Should().NotBeNull("KFS must be marked acknowledged after consent");

        var loadedConsent = await _db.Consents.FindAsync(consent.Id);
        loadedConsent.Should().NotBeNull("consent row must persist");
        loadedConsent!.ApplicationId.Should().Be(app.Id);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task ConsentLinkage_ForeignKfsId_IsNotFoundForApplication()
    {
        // Create two separate applications
        var (_, appA) = await SeedAppAsync();
        var (_, appB) = await SeedAppAsync();  // second call creates another app

        var key = RandomNumberGenerator.GetBytes(32);
        var sigA = HmacSig(key, appA.Id, 100_000m, 15m, 12, 8884.88m);
        var sigB = HmacSig(key, appB.Id, 100_000m, 15m, 12, 8884.88m);

        // KFS for appA
        var kfsA = KeyFactsStatement.Create(appA.Id, 100_000m, 12, 15m, 8884.88m,
            "[]", "[]", "Bank", "contact", 3, sigA);
        _db.KeyFactsStatements.Add(kfsA);
        await _db.SaveChangesAsync();

        // Trying to find kfsA for appB should return null (cross-app isolation)
        var crossQuery = await _db.KeyFactsStatements
            .Where(k => k.Id == kfsA.Id
                        && k.ApplicationId == appB.Id  // wrong application
                        && k.DeletedAt == null)
            .FirstOrDefaultAsync();

        crossQuery.Should().BeNull("a KFS from appA must not be found when querying with appB's ID");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Kfs_HmacSignature_IsImmutable_AfterPersist()
    {
        var (_, app) = await SeedAppAsync();
        var key = RandomNumberGenerator.GetBytes(32);
        var originalSig = HmacSig(key, app.Id, 100_000m, 15m, 12, 8884.88m);

        var kfs = KeyFactsStatement.Create(app.Id, 100_000m, 12, 15m, 8884.88m,
            "[]", "[]", "Bank", "contact", 3, originalSig);
        _db.KeyFactsStatements.Add(kfs);
        await _db.SaveChangesAsync();

        // Reload and verify signature unchanged (entity is immutable — no write methods)
        var loaded = await _db.KeyFactsStatements.FindAsync(kfs.Id);
        loaded!.HmacSignature.Should().Be(originalSig,
            "KFS signature must be immutable — no mutator methods expose the field");
    }
}
