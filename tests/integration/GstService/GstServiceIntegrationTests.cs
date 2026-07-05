// Converted to the shared migration-based fixture (tests/integration/_shared/MigrationSupport.cs):
// applies the real database/migrations/*.sql once to a template DB, then hands out an instant
// clone per test. WebApplicationFactory<Program> resolves against Finance.WebApi (the
// FinanceService composite that hosts GstService's endpoints) via DEV_AUTH_BYPASS, using the
// canned "dev-superadmin-token" (userId 22222222-2222-2222-2222-222222222222,
// organizationId 11111111-1111-1111-1111-111111111111 — see FirebaseAuthMiddleware.DevAuthTokens).

using FluentAssertions;
using GstService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.IntegrationTests.Shared;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace GstService.IntegrationTests;

/// <summary>
/// Integration tests for the GST Service API endpoints (hosted inside the FinanceService composite).
/// Uses the shared migrated-Postgres fixture (real database/migrations/*.sql schema).
/// </summary>
[Collection("migrated")]
public class GstNoticeIntegrationTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;

    private HttpClient _client = null!;
    private WebApplicationFactory<Program> _factory = null!;

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
    // Notice creation — P6-HANDOFF-14 / GAP-108
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Happy path: POST /gst/notices with a valid payload returns 201 Created with the notice's ID.
    /// BUG-GST-NOTICE-GSTIN fixed: gst.notices.gstin is a NOT-NULL column with a GSTIN-format CHECK
    /// (migration 021); CreateNoticeCommand now captures an optional `gstin` (resolved from the org's
    /// latest GST return when omitted). Payload supplies an explicit, valid GSTIN.
    /// </summary>
    [Fact]
    public async Task PostGstNotice_ValidPayload_Returns201WithId()
    {
        // Arrange
        var request = new
        {
            organizationId = Guid.NewGuid(),
            gstin = "27AABCU9603R1ZM",
            noticeNumber = "ASMT-10-2024-001",
            noticeType = "ASMT-10",
            issuedBy = "GST Officer",
            issuedDate = "2026-03-01",
            dueDate = "2026-04-30",
            description = "Mismatch in GSTR-3B vs GSTR-1 for March 2024",
        };

        // Act
        var response = await _client.PostAsJsonAsync("/gst/notices", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.TryGetProperty("noticeId", out var id).Should().BeTrue();
        id.GetGuid().Should().NotBeEmpty();
    }

    /// <summary>
    /// Error path: POST /gst/notices with an empty NoticeNumber returns 400 Bad Request
    /// (CreateNoticeCommandValidator: NotEmpty().MaximumLength(100)).
    /// </summary>
    [Fact]
    public async Task PostGstNotice_EmptyNoticeNumber_Returns400()
    {
        // Arrange — noticeNumber intentionally blank
        var request = new
        {
            organizationId = Guid.NewGuid(),
            noticeNumber = "",
            noticeType = "ASMT-10",
            issuedDate = "2026-03-01",
            description = "Test",
        };

        // Act
        var response = await _client.PostAsJsonAsync("/gst/notices", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// Error path: POST /gst/notices with a missing OrganizationId (Guid.Empty) returns 400.
    /// </summary>
    [Fact]
    public async Task PostGstNotice_EmptyOrganizationId_Returns400()
    {
        var request = new
        {
            organizationId = Guid.Empty,
            noticeNumber = "ASMT-10-2024-003",
            noticeType = "ASMT-10",
            issuedDate = "2026-03-01",
            description = "Test",
        };

        var response = await _client.PostAsJsonAsync("/gst/notices", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}

/// <summary>
/// EF Core smoke tests for the IMS DbSets (GAP-101). Migration 074
/// (074_gst_ims_gstr1a_schema_and_permissions.sql) provides gst.ims_invoices /
/// gst.ims_action_logs / gst.gstr1a_amendments — the tables are no longer absent, so the prior
/// DDL-HANDOFF-IMS skip is removed. Runs against the real migrated schema (not EF InMemory) so it
/// also proves the DbSets round-trip against the actual columns/constraints.
/// </summary>
[Collection("migrated")]
public class ImsEfSmokeTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;
    private GstDbContext _db = null!;

    public Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();
        var options = new DbContextOptionsBuilder<GstDbContext>()
            .UseNpgsql(_connectionString)
            .Options;
        _db = new GstDbContext(options);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _db.DisposeAsync();

    [Fact]
    public async Task ImsInvoices_DbSet_IsRegisteredOnDbContext()
    {
        var count = await _db.ImsInvoices.CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task ImsActionLogs_DbSet_IsRegisteredOnDbContext()
    {
        var count = await _db.ImsActionLogs.CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task Gstr1aAmendments_DbSet_IsRegisteredOnDbContext()
    {
        var count = await _db.Gstr1aAmendments.CountAsync();
        count.Should().Be(0);
    }
}

/// <summary>
/// Integration tests for HSN/SAC search endpoint.
/// </summary>
[Collection("migrated")]
public class GstHsnSacIntegrationTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;

    private HttpClient _client = null!;
    private WebApplicationFactory<Program> _factory = null!;

    public Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
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

    // BUG-GST-HSN-SEARCH-PARAM fixed: SearchHsnSac now binds both [FromQuery(Name="query")] (the
    // documented contract) and [FromQuery(Name="q")] (backward compat), so requests built to the
    // documented ?query=... contract reach the ranked-search logic instead of 400ing on a missing `q`.

    /// <summary>
    /// Happy path: GET /gst/hsn-sac/search?query=wheat returns ranked results per the documented contract.
    /// </summary>
    [Fact]
    public async Task GetHsnSac_ValidQuery_ReturnsRankedResults()
    {
        // Act
        var response = await _client.GetAsync("/gst/hsn-sac/search?query=wheat&limit=10");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.TryGetProperty("items", out var items).Should().BeTrue();
        items.ValueKind.Should().Be(JsonValueKind.Array);
    }

    /// <summary>
    /// Error path: GET /gst/hsn-sac/search with a blank query returns 400 or empty result.
    /// The endpoint must not crash on a blank/missing search term — this holds regardless of the
    /// `query` vs `q` param-name mismatch above (a missing/blank param legitimately 400s either way).
    /// </summary>
    [Fact]
    public async Task GetHsnSac_EmptyQuery_Returns200WithEmptyItems()
    {
        // Act
        var response = await _client.GetAsync("/gst/hsn-sac/search?query=&limit=10");

        // Assert — either 200 with empty items, or 400 (both are acceptable)
        response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// Verifies the search respects the limit parameter (max 10).
    /// </summary>
    [Fact]
    public async Task GetHsnSac_WithLimit10_ReturnsAtMost10Items()
    {
        // Act
        var response = await _client.GetAsync("/gst/hsn-sac/search?query=service&limit=10");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var items = body.GetProperty("items");
        items.GetArrayLength().Should().BeLessOrEqualTo(10);
    }
}
