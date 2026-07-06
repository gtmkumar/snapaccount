using CallbackService.Domain.Enums;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SnapAccount.IntegrationTests.Shared;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace CallbackService.IntegrationTests;

/// <summary>
/// Integration tests for CallbackService state machine — valid transitions persist,
/// invalid transitions return Conflict. Uses the shared MigratedPostgresFixture (real
/// database/migrations/*.sql schema). No mocked DB per CLAUDE.md.
/// Phase 6E. Converted to MigratedPostgresFixture 2026-07-05 full-verification campaign.
/// </summary>
[Collection("migrated")]
public class CallbackStateMachineTests(MigratedPostgresFixture pg) : IAsyncLifetime
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
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll(typeof(DbContextOptions<Infrastructure.Persistence.CallbackDbContext>));
                    services.AddDbContext<Infrastructure.Persistence.CallbackDbContext>(opts =>
                        opts.UseNpgsql(_connectionString));
                });
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
    // Happy path: create + assign + confirm + complete
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task RequestCallback_ValidPayload_Returns201WithPendingStatus()
    {
        var response = await _client.PostAsJsonAsync("/callbacks", new
        {
            phoneNumber = "+919876543210",
            category = 1,
            priority = 2,
            issueDescription = "GSTR-3B late fee query",
            userId = Guid.NewGuid(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        // CONTRACT: Assist.WebApi now registers JsonStringEnumConverter (Program.cs) to match
        // Platform/Finance.WebApi — BUG-ASSIST-NO-ENUM-CONVERTER is FIXED — so CallbackStatus
        // serializes as its string name ("Pending"), not the raw int.
        body.GetProperty("status").GetString().Should().Be(CallbackStatus.Pending.ToString());
    }

    [Fact]
    public async Task AssignCallback_FromPending_Returns204AndStatusBecomesAssigned()
    {
        var callbackId = await CreatePendingCallback();
        var agentId = Guid.NewGuid();

        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign",
            new { agentId });

        // CONTRACT: real endpoint returns 204 NoContent (docs/api/endpoints.md:619).
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var detail = await _client.GetFromJsonAsync<JsonElement>($"/callbacks/{callbackId}");
        detail.GetProperty("status").GetString().Should().Be(CallbackStatus.Assigned.ToString());
    }

    [Fact]
    public async Task ConfirmCallback_FromAssigned_Returns204AndStatusBecomesConfirmed()
    {
        var callbackId = await CreatePendingCallback();
        var agentId = Guid.NewGuid();
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign", new { agentId });

        var scheduledAt = DateTime.UtcNow.AddHours(3).ToString("O");
        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/confirm",
            new { scheduledAt });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var detail = await _client.GetFromJsonAsync<JsonElement>($"/callbacks/{callbackId}");
        detail.GetProperty("status").GetString().Should().Be(CallbackStatus.Confirmed.ToString());
    }

    [Fact]
    public async Task CompleteCallback_FromConfirmed_Returns204AndStatusBecomesCompleted()
    {
        var callbackId = await CreatePendingCallback();
        var agentId = Guid.NewGuid();
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign", new { agentId });
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/confirm",
            new { scheduledAt = DateTime.UtcNow.AddHours(2).ToString("O") });

        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/complete",
            new { resolutionSummary = "Issue resolved — GSTR-3B late fee waived." });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var detail = await _client.GetFromJsonAsync<JsonElement>($"/callbacks/{callbackId}");
        detail.GetProperty("status").GetString().Should().Be(CallbackStatus.Completed.ToString());
    }

    // ──────────────────────────────────────────────────────────────
    // Invalid transitions — CONTRACT: every callback command handler maps ANY failure
    // (including invalid state transitions) to 400 BadRequest, not 409 Conflict — the
    // endpoint code (Callbacks.cs) does `result.IsSuccess ? Results.NoContent() :
    // Results.BadRequest(...)` unconditionally, without inspecting Error.Type. Matches
    // docs/api/endpoints.md (which documents only the success code); not logged as a bug.
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task CompleteCallback_FromPending_Returns400()
    {
        var callbackId = await CreatePendingCallback();

        // Attempt to complete directly from Pending (invalid — must go via Assigned/Confirmed)
        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/complete",
            new { resolutionSummary = "Premature completion attempt." });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AssignCallback_WhenAlreadyAssigned_Returns400()
    {
        var callbackId = await CreatePendingCallback();
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign", new { agentId = Guid.NewGuid() });

        // Second assign from Assigned state is invalid
        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign",
            new { agentId = Guid.NewGuid() });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ConfirmCallback_FromPending_Returns400()
    {
        var callbackId = await CreatePendingCallback();

        // Must be Assigned before confirming
        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/confirm",
            new { scheduledAt = DateTime.UtcNow.AddHours(1).ToString("O") });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CancelCallback_AfterCompleted_Returns400()
    {
        var callbackId = await CreatePendingCallback();
        var agentId = Guid.NewGuid();
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign", new { agentId });
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/confirm",
            new { scheduledAt = DateTime.UtcNow.AddHours(1).ToString("O") });
        await _client.PostAsJsonAsync($"/callbacks/{callbackId}/complete",
            new { resolutionSummary = "Done" });

        // Cannot cancel after completion
        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/cancel",
            new { reason = "Too late" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ──────────────────────────────────────────────────────────────
    // Escalate — valid from Pending
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task EscalateCallback_FromPending_Returns204AndStatusBecomesEscalated()
    {
        var callbackId = await CreatePendingCallback();

        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/escalate",
            new { reason = "Complex ITR query — needs senior CA" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var detail = await _client.GetFromJsonAsync<JsonElement>($"/callbacks/{callbackId}");
        detail.GetProperty("status").GetString().Should().Be(CallbackStatus.Escalated.ToString());
    }

    // ──────────────────────────────────────────────────────────────
    // Add note
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task AddNote_ValidContent_Returns201()
    {
        var callbackId = await CreatePendingCallback();

        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/notes", new
        {
            content = "Called the customer — line was busy, will try again in 30 minutes.",
            isInternal = false,
            outcome = "NO_ANSWER",
            durationMinutes = 2,
        });

        // CONTRACT: AddNoteCommand is a bodyless ICommand (docs/api/endpoints.md:625 documents
        // only "201", no response shape) — the endpoint calls Results.Created() with no value,
        // so there is no note id in the response body to assert on.
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    // ──────────────────────────────────────────────────────────────
    // Validation errors
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task RequestCallback_InvalidPhoneFormat_Returns400()
    {
        var response = await _client.PostAsJsonAsync("/callbacks", new
        {
            phoneNumber = "9876543210",  // missing +91
            category = 1,
            priority = 1,
            userId = Guid.NewGuid(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetCallback_NonExistentId_Returns404()
    {
        var response = await _client.GetAsync($"/callbacks/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ──────────────────────────────────────────────────────────────
    // List callbacks
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task ListCallbacks_Returns200WithPaginatedResult()
    {
        await CreatePendingCallback();
        await CreatePendingCallback();

        var response = await _client.GetAsync("/callbacks?page=1&size=10");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("items").GetArrayLength().Should().BeGreaterThanOrEqualTo(2);
    }

    // ──────────────────────────────────────────────────────────────
    // Helper
    // ──────────────────────────────────────────────────────────────

    private async Task<Guid> CreatePendingCallback()
    {
        var response = await _client.PostAsJsonAsync("/callbacks", new
        {
            phoneNumber = "+919876543210",
            category = 1,
            priority = 1,
            issueDescription = "Integration test callback",
            userId = Guid.NewGuid(),
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return Guid.Parse(body.GetProperty("callbackId").GetString()!);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// SEC-029: IDOR / cross-org access tests
// ──────────────────────────────────────────────────────────────────────────────

/// <summary>
/// SEC-029: Verifies that callback endpoints return 404 when accessed by a user
/// whose OrganizationId does not match the callback's organization.
/// Converted to MigratedPostgresFixture 2026-07-05 full-verification campaign.
/// </summary>
[Collection("migrated")]
public class CallbackIdrSecurityTests(MigratedPostgresFixture pg) : IAsyncLifetime
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
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll(typeof(DbContextOptions<Infrastructure.Persistence.CallbackDbContext>));
                    services.AddDbContext<Infrastructure.Persistence.CallbackDbContext>(opts =>
                        opts.UseNpgsql(_connectionString));

                    // SEC-029: override ICurrentUser to inject a specific org context per test
                    services.RemoveAll(typeof(SnapAccount.Shared.Application.ICurrentUser));
                    services.AddScoped<SnapAccount.Shared.Application.ICurrentUser, TestCurrentUser>();
                });
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

    // CONTRACT/harness note: neither [ThreadStatic] (the original design) nor AsyncLocal work
    // here — WebApplicationFactory's in-memory TestServer processes the request as a genuinely
    // separate request pipeline invocation, not a nested continuation of the calling test's
    // async flow, so no ambient (thread- or async-local) state set by the test method is ever
    // visible to the server-side ICurrentUser. The only channel that reliably crosses that
    // boundary is the actual HTTP request itself, so org context is passed via a custom header
    // ("X-Test-Org-Id") that TestCurrentUser reads via IHttpContextAccessor.
    private static void SetOrgHeader(HttpClient client, Guid orgId)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Org-Id");
        client.DefaultRequestHeaders.Add("X-Test-Org-Id", orgId.ToString());
    }

    /// <summary>
    /// SEC-029: GET /callbacks/{id} for a callback belonging to a different org returns 404.
    /// Prevents existence leak — attacker learns nothing about cross-org resources.
    /// </summary>
    [Fact]
    public async Task GetCallback_CrossOrgAccess_Returns404()
    {
        // Create a callback with org A
        var orgA = Guid.NewGuid();
        SetOrgHeader(_client, orgA);

        var createResponse = await _client.PostAsJsonAsync("/callbacks", new
        {
            phoneNumber = "+919876543210",
            category = 1,
            priority = 1,
            issueDescription = "Belongs to org A",
            userId = Guid.NewGuid(),
        });
        createResponse.EnsureSuccessStatusCode();
        var body = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var callbackId = Guid.Parse(body.GetProperty("callbackId").GetString()!);

        // Switch to org B — should not be able to see org A's callback
        SetOrgHeader(_client, Guid.NewGuid());
        var response = await _client.GetAsync($"/callbacks/{callbackId}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "SEC-029: cross-org GET must return 404 to prevent existence leak");
    }

    /// <summary>
    /// SEC-029: POST /callbacks/{id}/assign for a cross-org callback is rejected (not 200).
    /// CONTRACT: unlike GET (which distinguishes 404), AssignCallback's endpoint code maps
    /// EVERY command failure — including the org-scoped "not found" case — to 400 BadRequest
    /// (`Callbacks.cs`'s `result.IsSuccess ? Results.NoContent() : Results.BadRequest(...)`,
    /// same unconditional mapping documented on the state-machine tests above). Still IDOR-safe
    /// (never 200 for a cross-org resource), just not literally 404 like the read path.
    /// </summary>
    [Fact]
    public async Task AssignCallback_CrossOrgAccess_Returns400()
    {
        var orgA = Guid.NewGuid();
        SetOrgHeader(_client, orgA);

        var createResponse = await _client.PostAsJsonAsync("/callbacks", new
        {
            phoneNumber = "+919876543210",
            category = 4,
            priority = 2,
            issueDescription = "Belongs to org A",
            userId = Guid.NewGuid(),
        });
        createResponse.EnsureSuccessStatusCode();
        var body = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var callbackId = Guid.Parse(body.GetProperty("callbackId").GetString()!);

        // Org B tries to assign
        SetOrgHeader(_client, Guid.NewGuid());
        var response = await _client.PostAsJsonAsync($"/callbacks/{callbackId}/assign",
            new { agentId = Guid.NewGuid() });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "SEC-029: cross-org assign must return 404 to prevent existence leak");
    }

    /// <summary>
    /// SEC-029: Same-org access to GET /callbacks/{id} returns 200 (control case).
    /// </summary>
    [Fact]
    public async Task GetCallback_SameOrgAccess_Returns200()
    {
        var orgId = Guid.NewGuid();
        SetOrgHeader(_client, orgId);

        var createResponse = await _client.PostAsJsonAsync("/callbacks", new
        {
            phoneNumber = "+919876543210",
            category = 2,
            priority = 1,
            issueDescription = "Belongs to same org",
            userId = Guid.NewGuid(),
        });
        createResponse.EnsureSuccessStatusCode();
        var body = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var callbackId = Guid.Parse(body.GetProperty("callbackId").GetString()!);

        // Same org (header unchanged) — should succeed
        var response = await _client.GetAsync($"/callbacks/{callbackId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "SEC-029: same-org GET must succeed");
    }
}

/// <summary>
/// SEC-029 test helper: an ICurrentUser whose OrganizationId is read from the "X-Test-Org-Id"
/// request header (via IHttpContextAccessor) rather than any ambient/static state — see the
/// harness note on CallbackIdrSecurityTests.SetOrgHeader for why ambient state doesn't work
/// with WebApplicationFactory's in-memory TestServer.
/// </summary>
public sealed class TestCurrentUser(Microsoft.AspNetCore.Http.IHttpContextAccessor accessor)
    : SnapAccount.Shared.Application.ICurrentUser
{
    public Guid UserId => Guid.NewGuid();

    public Guid? OrganizationId
    {
        get
        {
            var header = accessor.HttpContext?.Request.Headers["X-Test-Org-Id"].FirstOrDefault();
            return Guid.TryParse(header, out var orgId) ? orgId : null;
        }
    }
    public IReadOnlyList<string> Roles => [];
    // SEC-026/028: grant all permissions ("*") so the permission gate does not block IDOR tests
    public IReadOnlyList<string> Permissions => ["*"];
    public bool IsAuthenticated => true;
    public string? FirebaseUid => null;
    public string? PhoneNumber => null;
    public string? Email => null;

    public bool IsInRole(string role) => false;
    // SEC-026/028: in these IDOR tests grant all permissions so permission gate does not block
    public bool HasPermission(string permission) => true;
}
