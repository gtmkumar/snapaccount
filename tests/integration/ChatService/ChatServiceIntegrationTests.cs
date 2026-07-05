using ChatService.Application.Common.Interfaces;
using ChatService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;
using SnapAccount.IntegrationTests.Shared;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ChatService.IntegrationTests;

/// <summary>
/// Integration tests for the Chat Service (Assist composite, :5203).
/// Uses the shared MigratedPostgresFixture (real database/migrations/*.sql schema) —
/// converted from the original all-P6-INT-02-skipped placeholder suite that had never run.
///
/// CONTRACT notes fixed during conversion:
///   - Assist.WebApi has no JsonStringEnumConverter (see BUG-ASSIST-NO-ENUM-CONVERTER in
///     bug-log) — ThreadCategory/ParticipantRole must be sent as their raw int value in
///     request bodies (StartThreadRequest.Category, AssignRequest.AssigneeRole, etc.).
///   - GetThreadDetailQuery serializes Status/Category/ParticipantRole via
///     EnumUpperSnake.Serialize → "OPEN"/"PENDING_USER"/"RESOLVED"/"ESCALATED"/"REOPENED"
///     (UPPER_SNAKE), NOT the lowercase the original draft assumed.
///   - StartThreadCommand's own response (StartThreadResponse) uses plain enum .ToString()
///     (PascalCase, e.g. "Open") — a real, if minor, casing inconsistency vs GetThreadDetail's
///     UPPER_SNAKE for the conceptually same field; documented, not worked around.
///   - StartThreadRequest.InitialMessage is required (non-nullable) — the original draft never
///     supplied it.
///   - Ambient ICurrentUser overrides don't cross WebApplicationFactory's TestServer boundary
///     (see the CallbackService conversion's bug-log note) — multi-user/IDOR scenarios use a
///     header-based ICurrentUser (X-Test-User-Id / X-Test-Org-Id) instead of the original
///     [ThreadStatic]-based SetTestUser helper, which never actually worked.
/// Phase 6F. Converted to MigratedPostgresFixture 2026-07-05 full-verification campaign.
/// </summary>
[Collection("migrated")]
public class ChatServiceIdempotencyTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;

    private HttpClient _client = null!;
    private WebApplicationFactory<Program> _factory = null!;
    private readonly Mock<IChatHubNotifier> _hubNotifierMock = new();

    // ──────────────────────────────────────────────────────────────────────────
    // IAsyncLifetime
    // ──────────────────────────────────────────────────────────────────────────

    public Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        // Default mock: hub notifier silently succeeds (no real SignalR in tests)
        _hubNotifierMock
            .Setup(x => x.NotifyMessageAsync(
                It.IsAny<Guid>(),
                It.IsAny<ChatService.Application.Threads.Commands.SendMessage.SendMessageResponse>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        _hubNotifierMock
            .Setup(x => x.NotifyTypingAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<DbContextOptions<ChatServiceDbContext>>();
                    services.AddDbContext<ChatServiceDbContext>(options =>
                        options.UseNpgsql(_connectionString));

                    // Replace SignalR hub notifier with a no-op mock
                    services.RemoveAll<IChatHubNotifier>();
                    services.AddSingleton(_hubNotifierMock.Object);

                    // Header-driven ICurrentUser — see class doc comment for why ambient
                    // (ThreadStatic/AsyncLocal) state doesn't work across TestServer's boundary.
                    services.RemoveAll(typeof(SnapAccount.Shared.Application.ICurrentUser));
                    services.AddScoped<SnapAccount.Shared.Application.ICurrentUser, ChatTestCurrentUser>();
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

    // ──────────────────────────────────────────────────────────────────────────
    // Helper: set per-test user/org via headers (see ChatTestCurrentUser)
    // ──────────────────────────────────────────────────────────────────────────

    private void SetTestUser(Guid userId, Guid orgId)
    {
        _client.DefaultRequestHeaders.Remove("X-Test-User-Id");
        _client.DefaultRequestHeaders.Remove("X-Test-Org-Id");
        _client.DefaultRequestHeaders.Add("X-Test-User-Id", userId.ToString());
        _client.DefaultRequestHeaders.Add("X-Test-Org-Id", orgId.ToString());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test: SendMessage idempotency via client_message_id
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task SendMessage_SameClientMessageId_ReturnsExistingMessage()
    {
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        SetTestUser(userId, orgId);

        // Step 1: Open a thread (POST /chat/threads). ThreadCategory.GST = 1 (int — no
        // JsonStringEnumConverter on Assist.WebApi). InitialMessage is required.
        var openResponse = await _client.PostAsJsonAsync("/chat/threads", new
        {
            category = 1,
            subject = "Idempotency Test Thread",
            initialMessage = "Hello, is anyone there?",
        });
        openResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var threadBody = await openResponse.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = threadBody.GetProperty("threadId").GetString();
        threadId.Should().NotBeNullOrEmpty();

        var clientMessageId = Guid.NewGuid().ToString();

        // Step 2: Send first message
        var send1 = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/messages", new
        {
            body = "Follow-up message",
            clientMessageId,
        });
        send1.StatusCode.Should().Be(HttpStatusCode.Created);
        var msg1 = await send1.Content.ReadFromJsonAsync<JsonElement>();
        var msgId1 = msg1.GetProperty("messageId").GetString();

        // Step 3: Send again with same client_message_id (idempotent replay)
        var send2 = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/messages", new
        {
            body = "Follow-up message",
            clientMessageId,
        });
        send2.StatusCode.Should().Be(HttpStatusCode.Created);
        var msg2 = await send2.Content.ReadFromJsonAsync<JsonElement>();
        var msgId2 = msg2.GetProperty("messageId").GetString();

        // Assert: both responses return the same messageId (idempotency)
        msgId1.Should().Be(msgId2, "repeated send with same clientMessageId must be idempotent");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test: SendMessage IDOR — non-participant returns NotFound / Forbidden
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task SendMessage_NonParticipantUser_ReturnsForbiddenOrNotFound()
    {
        // Arrange — create a thread as user A
        var userA = Guid.NewGuid();
        var orgA = Guid.NewGuid();
        SetTestUser(userA, orgA);

        var openResponse = await _client.PostAsJsonAsync("/chat/threads", new
        {
            category = 1,
            subject = "IDOR Test Thread",
            initialMessage = "IDOR test — initial message",
        });
        openResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var threadBody = await openResponse.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = threadBody.GetProperty("threadId").GetString();

        // Switch to user B (different org — cross-org IDOR attempt)
        var userB = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        SetTestUser(userB, orgB);

        // Act: user B tries to send a message in user A's thread
        var response = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/messages", new
        {
            body = "IDOR attempt message",
        });

        // Assert: must be 404 NotFound (org-scoped thread query returns null)
        // or 403 Forbidden (not a participant)
        var status = (int)response.StatusCode;
        status.Should().BeOneOf(new[] { 404, 403 },
            "cross-org thread access must return NotFound or Forbidden to prevent IDOR");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test: Thread state machine — Open → Resolved
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ThreadStateMachine_OpenToResolved()
    {
        // Arrange — create thread as user
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        SetTestUser(userId, orgId);

        var openResponse = await _client.PostAsJsonAsync("/chat/threads", new
        {
            category = 2, // ITR
            subject = "State Machine Test",
            initialMessage = "State machine test — initial message",
        });
        openResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var threadBody = await openResponse.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = threadBody.GetProperty("threadId").GetString();

        // GET thread — should be Open. CONTRACT: GetThreadDetailQuery serializes via
        // EnumUpperSnake.Serialize → "OPEN" (upper-snake), not lowercase.
        var getResponse = await _client.GetAsync($"/chat/threads/{threadId}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var thread = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        thread.GetProperty("status").GetString().Should().Be("OPEN",
            "newly opened thread should have status 'OPEN' (EnumUpperSnake-serialized)");

        // POST resolve — transition to Resolved. CONTRACT: 204 NoContent.
        var resolveResponse = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/resolve", new { });
        resolveResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // GET thread — should now be Resolved
        var getResolved = await _client.GetAsync($"/chat/threads/{threadId}");
        getResolved.StatusCode.Should().Be(HttpStatusCode.OK);
        var resolvedThread = await getResolved.Content.ReadFromJsonAsync<JsonElement>();
        resolvedThread.GetProperty("status").GetString().Should().Be("RESOLVED",
            "thread should transition to 'RESOLVED' after POST /resolve");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test: Resolve already-resolved thread returns Conflict
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveThread_AlreadyResolved_ReturnsConflict()
    {
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        SetTestUser(userId, orgId);

        var openResponse = await _client.PostAsJsonAsync("/chat/threads", new
        {
            category = 1,
            subject = "Double Resolve Test",
            initialMessage = "Double resolve test — initial message",
        });
        var threadBody = await openResponse.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = threadBody.GetProperty("threadId").GetString();

        // First resolve — should succeed
        var resolve1 = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/resolve", new { });
        resolve1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Second resolve — should return Conflict (409). CONTRACT: ChatThread.Resolve()
        // returns Error.Conflict("ChatThread.AlreadyResolved", ...) and Chat.cs's MapError
        // switches on ErrorType (unlike CallbackService — see bug-log design note), so this
        // really is 409, not a flattened 400.
        var resolve2 = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/resolve", new { });
        ((int)resolve2.StatusCode).Should().Be(409,
            "resolving an already-resolved thread must return 409 Conflict");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test: Thread state machine — Escalate from Open
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task EscalateThread_FromOpen_Returns204()
    {
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        SetTestUser(userId, orgId);

        var openResponse = await _client.PostAsJsonAsync("/chat/threads", new
        {
            category = 1, // GST — closest available match for the original "gst-notice" intent
            subject = "Escalation Test",
            initialMessage = "Escalation test — initial message",
        });
        openResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var threadBody = await openResponse.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = threadBody.GetProperty("threadId").GetString();

        var escalateResponse = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/escalate", new { });
        escalateResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getThread = await _client.GetAsync($"/chat/threads/{threadId}");
        var thread = await getThread.Content.ReadFromJsonAsync<JsonElement>();
        thread.GetProperty("status").GetString().Should().Be("ESCALATED");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test: Reopen resolved thread — state machine cycle
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ReopenThread_FromResolved_ReturnsOpenStatus()
    {
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        SetTestUser(userId, orgId);

        var openResp = await _client.PostAsJsonAsync("/chat/threads", new
        {
            category = 1,
            subject = "Reopen Test",
            initialMessage = "Reopen test — initial message",
        });
        var threadBody = await openResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = threadBody.GetProperty("threadId").GetString();

        // Resolve (must be Resolved/Escalated before Reopen is valid — see ChatThread.Reopen()).
        var resolveResp = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/resolve", new { });
        resolveResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Reopen
        var reopenResp = await _client.PostAsJsonAsync($"/chat/threads/{threadId}/reopen", new { });
        reopenResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getThread = await _client.GetAsync($"/chat/threads/{threadId}");
        var thread = await getThread.Content.ReadFromJsonAsync<JsonElement>();
        thread.GetProperty("status").GetString().Should().Be("OPEN",
            "re-opened thread should have status 'OPEN'");
    }
}

/// <summary>
/// Header-driven ICurrentUser for ChatService integration tests. Reads X-Test-User-Id /
/// X-Test-Org-Id headers (set per-test via SetTestUser) through IHttpContextAccessor, falling
/// back to the fixed dev-superadmin identity when absent. See the CallbackService conversion's
/// bug-log note for why ambient ([ThreadStatic]/AsyncLocal) state doesn't work here —
/// WebApplicationFactory's in-memory TestServer processes each request as a genuinely separate
/// pipeline invocation, so only the actual HTTP request (headers) reliably carries per-test
/// identity across that boundary.
/// </summary>
public sealed class ChatTestCurrentUser(Microsoft.AspNetCore.Http.IHttpContextAccessor accessor)
    : SnapAccount.Shared.Application.ICurrentUser
{
    private static readonly Guid DefaultUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid DefaultOrgId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public Guid UserId => TryGetHeaderGuid("X-Test-User-Id") ?? DefaultUserId;
    public Guid? OrganizationId => TryGetHeaderGuid("X-Test-Org-Id") ?? DefaultOrgId;
    public IReadOnlyList<string> Roles => [];
    public IReadOnlyList<string> Permissions => ["*"];
    public bool IsAuthenticated => true;
    public string? FirebaseUid => null;
    public string? PhoneNumber => null;
    public string? Email => null;

    public bool IsInRole(string role) => false;
    public bool HasPermission(string permission) => true;

    private Guid? TryGetHeaderGuid(string headerName)
    {
        var value = accessor.HttpContext?.Request.Headers[headerName].FirstOrDefault();
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }
}
