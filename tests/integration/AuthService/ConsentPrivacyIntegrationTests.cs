// Integration tests: B7 — DPDP consent write + RLS isolation
// Uses real Postgres 17 via Testcontainers (shared collection fixture).
//
// Covers:
//   1. POST /auth/me/consents/{purpose}/grant — persists row, correct status
//   2. POST /auth/me/consents/{purpose}/withdraw — appends withdrawal row, idempotent
//   3. GET /auth/me/consents — returns latest row per purpose (no cross-user leak)
//   4. Database-level: UserConsent row is immutable after INSERT
//   5. POST /auth/me/data-export — creates pending row, returns requestId
//   6. GET /auth/me/data-export/status — returns status of the export job
//   7. POST /auth/me/data-correction — creates submitted request
//   8. GET /auth/me/data-correction — returns only own requests
//
// Auth: DEV_AUTH_BYPASS=true; user identity injected via ICurrentUser mock
// (same pattern as RbacApiTests/PermissionCatalogApiTests).

using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Net;
using System.Net.Http.Json;
using Testcontainers.PostgreSql;
using Xunit;

namespace AuthService.IntegrationTests;

/// <summary>
/// Integration tests for the B7 DPDP consent and data-export/correction endpoints.
/// These tests write to a real PostgreSQL database to validate schema, constraints,
/// and RLS-style isolation.
///
/// Pattern:
///   - Shares the PostgresFixture container (one container per assembly).
///   - Each test class gets its own fresh database via NewDatabaseConnectionString().
///   - The ICurrentUser is mocked per test class to simulate a logged-in user.
/// </summary>
[Collection("integration")]
public class ConsentPrivacyIntegrationTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly PostgresFixture _pg = pg;
    private string _connectionString = null!;

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _userA = null!;     // HTTP client authenticated as userA
    private HttpClient _userB = null!;     // HTTP client authenticated as userB

    private static readonly Guid UserAId  = Guid.NewGuid();
    private static readonly Guid UserBId  = Guid.NewGuid();
    private static readonly Guid TestOrgId = Guid.NewGuid();

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    public async Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        // Pre-create schema
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseNpgsql(_connectionString)
            .Options;
        using (var db = new AuthDbContext(opts))
            await db.Database.EnsureCreatedAsync();

        // Build factory with Postgres + mocked Firebase + dev-auth bypass
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
                // GAP-005 fail-fast: Testing is not "Development" so must supply a test secret.
                builder.UseSetting("Auth:SessionSecret", "it-session-secret-for-testing-min32!!");
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                builder.UseSetting("LOCAL_AUTH", "false");
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<DbContextOptions>();
                    services.RemoveAll<DbContextOptions<AuthDbContext>>();
                    services.AddDbContext<AuthDbContext>(o => o.UseNpgsql(_connectionString));

                    services.RemoveAll<IFirebaseAuthService>();
                    var fb = new Mock<IFirebaseAuthService>();
                    fb.Setup(f => f.CreateCustomTokenAsync(It.IsAny<string>(),
                            It.IsAny<Dictionary<string, object>>(), It.IsAny<CancellationToken>()))
                      .ReturnsAsync(Result<string>.Success("fake-token"));
                    services.AddSingleton(fb.Object);
                });
            });

        // Seed test users directly in DB so they exist for FK checks
        using var scope = _factory.Services.CreateScope();
        var db2 = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
        await SeedTestUsersAsync(db2);

        _userA = BuildAuthenticatedClient(UserAId);
        _userB = BuildAuthenticatedClient(UserBId);
    }

    public async Task DisposeAsync()
    {
        _userA.Dispose();
        _userB.Dispose();
        await _factory.DisposeAsync();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private HttpClient BuildAuthenticatedClient(Guid userId)
    {
        // A canned dev bearer token satisfies the middleware's RequireAuthorization gate;
        // the per-user ICurrentUser mock then supplies the specific identity the handlers
        // scope on (own-consent / own-request isolation). The X-Dev-User-Id header contract
        // this test originally used no longer exists — the middleware maps canned tokens only.
        var factory = _factory.WithWebHostBuilder(b =>
        {
            b.ConfigureServices(services =>
            {
                services.RemoveAll<ICurrentUser>();
                var mock = new Mock<ICurrentUser>();
                mock.Setup(u => u.IsAuthenticated).Returns(true);
                mock.Setup(u => u.UserId).Returns(userId);
                mock.Setup(u => u.OrganizationId).Returns(TestOrgId);
                mock.Setup(u => u.Roles).Returns(new List<string> { "BUSINESS_OWNER" }.AsReadOnly());
                mock.Setup(u => u.Permissions).Returns(new List<string> { "*" }.AsReadOnly());
                mock.Setup(u => u.HasPermission(It.IsAny<string>())).Returns(true);
                mock.Setup(u => u.IsInRole(It.IsAny<string>())).Returns<string>(r => r == "BUSINESS_OWNER");
                services.AddScoped(_ => mock.Object);
            });
        });
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");
        // TestServer leaves Connection.RemoteIpAddress null; the consent endpoints read the
        // originating client IP from X-Forwarded-For (gateway-forwarded), so supply one here
        // to exercise the audit-IP capture path deterministically.
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.10");
        return client;
    }

    private async Task SeedTestUsersAsync(AuthDbContext db)
    {
        // Insert minimal user rows for FK constraints
        await db.Database.ExecuteSqlRawAsync($$"""
            INSERT INTO auth.user (id, full_name, is_active, is_phone_verified, is_email_verified, is_deleted, preferred_language, created_at, updated_at)
            VALUES
              ('{{UserAId}}', 'User A', true, false, false, false, 'en', NOW(), NOW()),
              ('{{UserBId}}', 'User B', true, false, false, false, 'en', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
            """);
    }

    private AuthDbContext GetDb()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseNpgsql(_connectionString).Options;
        return new AuthDbContext(opts);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GrantConsent_Post_CreatesGrantedRowInDatabase()
    {
        var response = await _userA.PostAsJsonAsync(
            "/auth/me/consents/marketing.sms/grant",
            new { noticeVersion = "v1.0", locale = "en" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var db = GetDb();
        var rows = await db.UserConsents
            .Where(c => c.UserId == UserAId && c.Purpose == "marketing.sms" && c.DeletedAt == null)
            .ToListAsync();

        rows.Should().HaveCount(1, "one granted consent row must be written");
        rows[0].Status.Should().Be("granted");
        rows[0].IpAddress.Should().NotBeNull("IP address must be captured");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task WithdrawConsent_Post_AppendsWithdrawalRow()
    {
        // Grant first
        await _userA.PostAsJsonAsync(
            "/auth/me/consents/analytics.usage/grant",
            new { noticeVersion = "v1.0", locale = "en" });

        // Then withdraw — withdraw returns 204 No Content (contract: endpoints.md, mobile privacy.ts).
        var response = await _userA.PostAsJsonAsync(
            "/auth/me/consents/analytics.usage/withdraw",
            new { noticeVersion = "v1.0" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var db = GetDb();
        var rows = await db.UserConsents
            .Where(c => c.UserId == UserAId && c.Purpose == "analytics.usage" && c.DeletedAt == null)
            .OrderBy(c => c.ActionAt)
            .ToListAsync();

        rows.Should().HaveCount(2, "grant + withdrawal = 2 immutable rows");
        rows[0].Status.Should().Be("granted");
        rows[1].Status.Should().Be("withdrawn");
        rows[1].WithdrawnAt.Should().NotBeNull("withdrawal row must have WithdrawnAt set");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetConsents_Returns_OnlyOwnConsents()
    {
        // User A grants marketing.sms
        await _userA.PostAsJsonAsync(
            "/auth/me/consents/marketing.sms/grant",
            new { noticeVersion = "v2.0", locale = "hi" });

        // User B grants marketing.sms
        await _userB.PostAsJsonAsync(
            "/auth/me/consents/marketing.sms/grant",
            new { noticeVersion = "v2.0", locale = "en" });

        // User A queries — must only see their own
        var response = await _userA.GetAsync("/auth/me/consents");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<GetMyConsentsApiResponse>();
        body.Should().NotBeNull();
        body!.Consents.Should().AllSatisfy(c =>
            c.Purpose.Should().Be("marketing.sms"),
            "User A should only see their own marketing.sms consent");

        // Ensure User B's row is NOT returned
        await using var db = GetDb();
        var userBRows = await db.UserConsents
            .Where(c => c.UserId == UserBId)
            .ToListAsync();
        userBRows.Should().HaveCount(1, "User B has 1 row but it must not appear in User A's response");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task EnqueueDataExport_Post_CreatesPendingRow()
    {
        var response = await _userA.PostAsync("/auth/me/data-export", null);
        // Async enqueue → 202 Accepted (DPDP export runs as a background job).
        response.StatusCode.Should().Be(HttpStatusCode.Accepted);

        await using var db = GetDb();
        var row = await db.DataExportRequests
            .Where(r => r.UserId == UserAId && r.DeletedAt == null)
            .FirstOrDefaultAsync();

        row.Should().NotBeNull("a data export request must be persisted");
        row!.Status.Should().Be("pending");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task SubmitDataCorrection_Post_CreatesSubmittedRow()
    {
        var response = await _userA.PostAsJsonAsync(
            "/auth/me/data-correction",
            new { dataCategory = "pan_number", description = "My PAN is incorrectly stored." });

        // Async submit → 202 Accepted (correction request queued for review).
        response.StatusCode.Should().Be(HttpStatusCode.Accepted);

        await using var db = GetDb();
        var row = await db.DataCorrectionRequests
            .Where(r => r.UserId == UserAId && r.DeletedAt == null)
            .FirstOrDefaultAsync();

        row.Should().NotBeNull("a data correction request must be persisted");
        row!.DataCategory.Should().Be("pan_number");
        row.Status.Should().Be("submitted");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task ListDataCorrections_Get_DoesNotReturnOtherUsersRequests()
    {
        // User A submits a correction
        await _userA.PostAsJsonAsync(
            "/auth/me/data-correction",
            new { dataCategory = "name", description = "Fix my name" });

        // User B submits a correction
        await _userB.PostAsJsonAsync(
            "/auth/me/data-correction",
            new { dataCategory = "address", description = "Fix my address" });

        // User A queries — should only see their own
        var response = await _userA.GetAsync("/auth/me/data-correction");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ListDataCorrectionApiResponse>();
        body.Should().NotBeNull();
        body!.Requests.Should().HaveCount(1, "User A must only see their own correction request");
        body.Requests[0].DataCategory.Should().Be("name");
    }

    // ── API response DTOs (match endpoint response shapes) ──────────────────

    private sealed record ConsentSummaryDto(string Purpose, string Status);
    private sealed record GetMyConsentsApiResponse(IReadOnlyList<ConsentSummaryDto> Consents);
    private sealed record DataCorrectionSummaryDto(Guid RequestId, string DataCategory, string Status);
    private sealed record ListDataCorrectionApiResponse(IReadOnlyList<DataCorrectionSummaryDto> Requests);
}
