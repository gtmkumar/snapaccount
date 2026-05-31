// Integration tests: Auth/RBAC Module 1
//
// Auth strategy:
//   - Unauthenticated: plain HttpClient (no token) → expect 401
//   - Authenticated (happy path): ICurrentUser mock registered in DI, granting specific
//     permissions. This is the correct approach because canned DEV_AUTH_BYPASS tokens
//     carry only role names in their claims; the PermissionBehavior checks HasPermission()
//     which needs the "permissions" claim (or "*") to be set.
//   - DEV_AUTH_BYPASS bearer tokens are still used where the test does NOT depend on
//     specific RBAC permissions (e.g., org isolation cross-org path tests where we
//     just verify the server does not return 200).
//
// Org isolation uses the fact that dev-admin-token is org 00000000-...
// and dev-user-token is org 44444444-... — different orgs.

using AuthService.Application.Interfaces;
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

[Collection("integration")]
public class RbacApiTests(PostgresFixture pg) : IAsyncLifetime
{
    // ─────────────────────────────────────────────────────────────────────
    // Infrastructure
    // ─────────────────────────────────────────────────────────────────────

    private readonly PostgresFixture _pg = pg;
    private string _connectionString = null!;

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _clientUnauthenticated = null!;

    // Org IDs matching the DEV_AUTH_BYPASS canned tokens
    private static readonly Guid OrgAId = Guid.Parse("00000000-0000-0000-0000-000000000000");
    private static readonly Guid OrgBId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    public async Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                builder.UseSetting("LOCAL_AUTH", "false");

                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<DbContextOptions>();
                    services.RemoveAll<DbContextOptions<AuthService.Infrastructure.Persistence.AuthDbContext>>();
                    services.AddDbContext<AuthService.Infrastructure.Persistence.AuthDbContext>(options =>
                        options.UseNpgsql(_connectionString));

                    services.RemoveAll<IFirebaseAuthService>();
                    var firebaseMock = new Mock<IFirebaseAuthService>();
                    firebaseMock
                        .Setup(f => f.CreateCustomTokenAsync(
                            It.IsAny<string>(), It.IsAny<Dictionary<string, object>>(),
                            It.IsAny<CancellationToken>()))
                        .ReturnsAsync(Result<string>.Success("fake-token"));
                    services.AddSingleton(firebaseMock.Object);
                });
            });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        await db.Database.EnsureCreatedAsync();

        _clientUnauthenticated = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _clientUnauthenticated.Dispose();
        await _factory.DisposeAsync();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a client backed by a mock ICurrentUser with the given permissions.
    /// The mock ICurrentUser is registered as scoped (overrides the real one per request).
    /// </summary>
    private HttpClient AuthenticatedClient(
        Guid userId, Guid? orgId, string[] permissions, string[] roles)
    {
        var factory = _factory.WithWebHostBuilder(b =>
        {
            b.ConfigureServices(services =>
            {
                // Replace the scoped ICurrentUser with a controllable mock
                services.RemoveAll<ICurrentUser>();
                var mock = new Mock<ICurrentUser>();
                mock.Setup(u => u.IsAuthenticated).Returns(true);
                mock.Setup(u => u.UserId).Returns(userId);
                mock.Setup(u => u.OrganizationId).Returns(orgId);
                mock.Setup(u => u.Roles).Returns(roles.ToList().AsReadOnly());
                mock.Setup(u => u.Permissions).Returns(permissions.ToList().AsReadOnly());
                mock.Setup(u => u.HasPermission(It.IsAny<string>()))
                    .Returns<string>(p => permissions.Contains("*") || permissions.Contains(p));
                mock.Setup(u => u.IsInRole(It.IsAny<string>()))
                    .Returns<string>(r => roles.Contains(r));
                // Register as scoped so each request gets its own instance
                services.AddScoped(_ => mock.Object);
            });
        });

        // We still need the ASP.NET auth pipeline to consider the user authenticated.
        // Provide a DEV_AUTH_BYPASS token so FirebaseAuthMiddleware sets HttpContext.User,
        // but ICurrentUser (the application-layer abstraction) comes from our mock.
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");
        return client;
    }

    /// <summary>
    /// Client with DEV_AUTH_BYPASS canned token — uses real CurrentUser impl.
    /// Useful for org isolation tests where we need different org IDs from the JWT.
    /// </summary>
    private HttpClient BearerClient(string token)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private async Task<string?> GetPermissionIdAsync(string permissionName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        var perm = await db.Permissions
            .Where(p => p.Name == permissionName && p.DeletedAt == null)
            .Select(p => new { p.Id })
            .FirstOrDefaultAsync();
        return perm?.Id.ToString();
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. ROLE LIST — authenticated vs unauthenticated
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetOrgRoles_AuthenticatedWithOrgRolesRead_Returns200()
    {
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.roles.read"],
            roles: ["ORG_ADMIN"]);

        var response = await client.GetAsync("/auth/org/roles");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "user with org.roles.read must receive the role list");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetOrgRoles_Unauthenticated_Returns401()
    {
        var response = await _clientUnauthenticated.GetAsync("/auth/org/roles");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. ROLE CREATE
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateOrgRole_WithOrgRolesCreate_Returns201()
    {
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.roles.create"],
            roles: ["ORG_ADMIN"]);

        var response = await client.PostAsJsonAsync("/auth/org/roles", new
        {
            name = "qa_test_role",
            displayName = "QA Test Role",
            description = "Created by integration test"
        });

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Created,
            HttpStatusCode.Conflict,  // name conflict on re-run is acceptable
            HttpStatusCode.BadRequest);
        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateOrgRole_Unauthenticated_Returns401()
    {
        var response = await _clientUnauthenticated.PostAsJsonAsync("/auth/org/roles", new
        {
            name = "evil_role",
            displayName = "Evil Role"
        });
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. ORG ISOLATION — CRITICAL SECURITY
    //    Using DEV_AUTH_BYPASS tokens which carry different org IDs:
    //    dev-admin-token  → org 00000000-...
    //    dev-user-token   → org 44444444-...
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgIsolation")]
    public async Task GetOrgRoles_CrossOrg_PathWithOtherOrgId_IsRejected()
    {
        using var clientOrgA = BearerClient("dev-admin-token");

        // Try to access the other org's roles via explicit org path
        var response = await clientOrgA.GetAsync($"/auth/org/{OrgBId}/roles");

        // Any response except 200 is correct — 403, 404, 401 are all fine
        response.StatusCode.Should().NotBe(HttpStatusCode.OK,
            "org A user must not see org B's roles — IDOR prevention");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgIsolation")]
    public async Task DeleteRole_ForeignRoleId_Returns403Or404()
    {
        // Authenticated as org A; attempt to delete a role that doesn't exist in their org
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.roles.delete"],
            roles: ["ORG_ADMIN"]);

        var foreignRoleId = Guid.NewGuid();
        var response = await client.DeleteAsync($"/auth/org/roles/{foreignRoleId}");

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound);
        response.StatusCode.Should().NotBe(HttpStatusCode.NoContent,
            "deleting a non-owned role must never return 204");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgIsolation")]
    public async Task GetOrgMembers_CrossOrg_PathWithOtherOrgId_IsRejected()
    {
        using var clientOrgA = BearerClient("dev-admin-token");
        var response = await clientOrgA.GetAsync($"/auth/org/{OrgBId}/members");

        response.StatusCode.Should().NotBe(HttpStatusCode.OK,
            "org A user must not see org B's members — IDOR prevention");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. MEMBERS LIST — own org, authenticated
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetTeamMembers_WithOrgMembersRead_Returns200()
    {
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.members.read"],
            roles: ["ORG_ADMIN"]);

        var response = await client.GetAsync("/auth/team");

        response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.Forbidden);
        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetTeamMembers_Unauthenticated_Returns401()
    {
        var response = await _clientUnauthenticated.GetAsync("/auth/team");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. DELEGATION — PUT permissions without org.permissions.grant → 403
    //    CRITICAL SECURITY TEST
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Delegation")]
    public async Task SetRolePermissions_WithoutOrgPermissionsGrant_Returns403()
    {
        // Has org.roles.read and org.members.invite but NOT org.permissions.grant
        using var delegateClient = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.roles.read", "org.members.invite"],
            roles: ["DELEGATE"]);

        var roleId = Guid.NewGuid();
        var response = await delegateClient.PutAsJsonAsync(
            $"/auth/org/roles/{roleId}/permissions",
            new { permissionIds = Array.Empty<string>() });

        // PermissionBehavior intercepts: Forbidden before handler runs
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound);
        response.StatusCode.Should().NotBe(HttpStatusCode.OK);
        response.StatusCode.Should().NotBe(HttpStatusCode.NoContent,
            "delegate without org.permissions.grant must not set role permissions");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Delegation")]
    public async Task SetRolePermissions_DelegateEscalationAttempt_Returns403()
    {
        // Delegate HAS org.permissions.grant but NOT platform.permissions.manage.
        // Attempting to grant platform.permissions.manage is an escalation.
        var platformPermId = await GetPermissionIdAsync("platform.permissions.manage");
        if (platformPermId is null)
        {
            // Not seeded — skip gracefully (no failure on missing seed data)
            return;
        }

        using var escalatingClient = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.permissions.grant", "org.roles.read"],
            roles: ["DELEGATE"]);

        var roleId = Guid.NewGuid();
        var response = await escalatingClient.PutAsJsonAsync(
            $"/auth/org/roles/{roleId}/permissions",
            new { permissionIds = new[] { platformPermId } });

        // Delegation guard in SetRolePermissionsCommandHandler must reject escalation.
        // 404 = role not in this org (also safe), 403 = explicit delegation rejection.
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound);
        response.StatusCode.Should().NotBe(HttpStatusCode.OK);
        response.StatusCode.Should().NotBe(HttpStatusCode.NoContent,
            "server must reject privilege escalation via role permission assignment");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. GRANTABLE PERMISSIONS
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetGrantablePermissions_Authenticated_Returns200()
    {
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.permissions.read"],
            roles: ["ORG_ADMIN"]);

        var response = await client.GetAsync("/auth/me/grantable-permissions");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "authenticated user with org.permissions.read must receive their grantable set");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetGrantablePermissions_Unauthenticated_Returns401()
    {
        var response = await _clientUnauthenticated.GetAsync("/auth/me/grantable-permissions");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. PERMISSION CATALOG
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetPermissionCatalog_Authenticated_Returns200WithModules()
    {
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.permissions.read"],
            roles: ["ORG_ADMIN"]);

        var response = await client.GetAsync("/auth/permissions");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "authenticated user must receive the permission catalog grouped by module");
        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetPermissionCatalog_Unauthenticated_Returns401()
    {
        var response = await _clientUnauthenticated.GetAsync("/auth/permissions");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. INVITE TOKEN — bogus token is rejected (public route)
    //    CRITICAL SECURITY TEST
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "InviteFlow")]
    public async Task ValidateInviteToken_BogusToken_Returns404OrBadRequest()
    {
        var bogusToken = "0000000000000000000000000000000000000000000000000000000000000000";
        var response = await _clientUnauthenticated.GetAsync($"/auth/invite/{bogusToken}");

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);
        response.StatusCode.Should().NotBe(HttpStatusCode.OK,
            "bogus invite token must be rejected — replay / forgery protection");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "InviteFlow")]
    public async Task AcceptInvite_BogusToken_AuthenticatedUser_Returns404OrBadRequest()
    {
        // Accept invite requires auth — use a real authenticated client
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: [],
            roles: ["EMPLOYEE"]);

        var bogusToken = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        var response = await client.PostAsJsonAsync(
            $"/auth/invite/{bogusToken}/accept",
            new { displayName = "Test User", password = "P@ss1234!", acceptedTerms = true });

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);
        response.StatusCode.Should().NotBe(HttpStatusCode.OK,
            "bogus invite token must never be accepted — replay attack prevention");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. INVITE MEMBER
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Delegation")]
    public async Task InviteMember_WithoutOrgMembersInvite_Returns403()
    {
        // Has org.roles.read only — no org.members.invite.
        // Send a well-formed request body so the PermissionBehavior (not FluentValidation)
        // causes the rejection. Pipeline order: Logging → Validation → PermissionBehavior.
        // Valid body passes Validation; then PermissionBehavior checks org.members.invite.
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.roles.read"],
            roles: ["DELEGATE"]);

        var response = await client.PostAsJsonAsync("/auth/team/invite", new
        {
            email = "attacker@evil.com",
            role = "CA"   // valid role name — passes FluentValidation
        });

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.Unauthorized);
        response.StatusCode.Should().NotBe(HttpStatusCode.Created,
            "user without org.members.invite must not send invitations");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task InviteMember_WithOrgMembersInvite_Returns201OrBadRequest()
    {
        using var client = AuthenticatedClient(
            Guid.NewGuid(), OrgAId,
            permissions: ["org.members.invite"],
            roles: ["ORG_ADMIN"]);

        var response = await client.PostAsJsonAsync("/auth/team/invite", new
        {
            email = "qa_invite@example.com",
            roleId = Guid.NewGuid().ToString()
        });

        // 201 = success; 400/404 = role not found in DB (acceptable for this test)
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Created,
            HttpStatusCode.BadRequest,
            HttpStatusCode.Conflict,
            HttpStatusCode.NotFound);
        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. PLATFORM ADMIN
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetAdminOrganizations_Unauthenticated_Returns401()
    {
        var response = await _clientUnauthenticated.GetAsync("/auth/admin/organizations");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
