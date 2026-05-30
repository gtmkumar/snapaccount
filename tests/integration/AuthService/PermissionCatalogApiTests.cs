// Integration tests: Permission Catalog increment (scope §5c)
//
// Covers:
//   1. POST /auth/permissions — happy path 201, resource/action parsed
//   2. POST /auth/permissions — duplicate → 409 Permission.Duplicate
//   3. POST /auth/permissions — bad name format → 400 Validation.Failed
//   4. PUT  /auth/permissions/{id} — description update → 204
//   5. DELETE /auth/permissions/{id} — unused → 204
//   6. DELETE /auth/permissions/{id} — in use by a role → 409 Permission.InUse with count
//   7. AUTHZ: caller without platform.permissions.manage → 403 on POST / PUT / DELETE
//   8. Task A: org-invalid-context (zero-UUID org or non-existent org) → 409 Org.InvalidContext
//
// Auth strategy: same ICurrentUser mock approach proven in RbacApiTests.

using AuthService.Application.Common.Guards;
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

[Collection("PermCatalogApi")]
public class PermissionCatalogApiTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:17-alpine")
        .WithDatabase("snapaccount_permcat_test")
        .WithUsername("postgres")
        .WithPassword("postgres_permcat_test")
        .Build();

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _unauthenticated = null!;

    private static readonly Guid TestOrgId = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

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
                    services.AddDbContext<AuthService.Infrastructure.Persistence.AuthDbContext>(opts =>
                        opts.UseNpgsql(_postgres.GetConnectionString()));

                    services.RemoveAll<IFirebaseAuthService>();
                    var fbMock = new Mock<IFirebaseAuthService>();
                    fbMock.Setup(f => f.CreateCustomTokenAsync(
                            It.IsAny<string>(), It.IsAny<Dictionary<string, object>>(),
                            It.IsAny<CancellationToken>()))
                        .ReturnsAsync(Result<string>.Success("fake-token"));
                    services.AddSingleton(fbMock.Object);
                });
            });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        await db.Database.EnsureCreatedAsync();

        // Seed the test org via raw SQL so we control the UUID
        // (Organization entity uses protected set on Id — cannot set via object init)
        await db.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO auth.organization
                (id, owner_user_id, business_name, country, is_gst_registered,
                 is_msme_registered, is_active, created_at, updated_at)
            VALUES
                ({0}, {1}, 'Catalog Test Org', 'India', false, false, true, now(), now())
            ON CONFLICT (id) DO NOTHING
            """,
            TestOrgId, Guid.NewGuid());

        _unauthenticated = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _unauthenticated.Dispose();
        await _factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private HttpClient SuperAdminClient() =>
        AuthenticatedClient(
            userId: Guid.NewGuid(),
            orgId: null,                         // SUPER_ADMIN — no org scope
            permissions: ["*"],
            roles: ["SUPER_ADMIN"]);

    private HttpClient ManagerClient() =>
        AuthenticatedClient(
            userId: Guid.NewGuid(),
            orgId: TestOrgId,
            // Has org.* but NOT platform.permissions.manage
            permissions: ["org.permissions.read", "org.permissions.grant", "org.roles.create", "org.roles.read"],
            roles: ["DEV_LIMITED_MANAGER"]);

    private HttpClient ZeroUuidOrgClient() =>
        AuthenticatedClient(
            userId: Guid.NewGuid(),
            orgId: Guid.Empty,                   // all-zeros — OrgContextGuard should reject
            permissions: ["org.roles.create", "org.members.invite"],
            roles: ["ORG_ADMIN"]);

    private HttpClient NonExistentOrgClient() =>
        AuthenticatedClient(
            userId: Guid.NewGuid(),
            orgId: Guid.NewGuid(),               // random GUID — no DB row
            permissions: ["org.roles.create", "org.members.invite"],
            roles: ["ORG_ADMIN"]);

    private HttpClient AuthenticatedClient(
        Guid userId, Guid? orgId, string[] permissions, string[] roles)
    {
        var factory = _factory.WithWebHostBuilder(b =>
        {
            b.ConfigureServices(services =>
            {
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
                services.AddScoped(_ => mock.Object);
            });
        });

        var client = factory.CreateClient();
        // DEV_AUTH_BYPASS bearer so FirebaseAuthMiddleware sets HttpContext.User
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");
        return client;
    }

    private async Task<Guid> CreatePermissionAsync(HttpClient client, string name, string? description = null)
    {
        var resp = await client.PostAsJsonAsync("/auth/permissions",
            new { name, description = description ?? $"Test perm {name}" });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await resp.Content.ReadFromJsonAsync<PermissionResponseDto>();
        body.Should().NotBeNull();
        return body!.Id;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. POST /auth/permissions — happy path
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreatePermission_ValidDotNotation_Returns201WithParsedResourceAction()
    {
        using var superAdmin = SuperAdminClient();

        var resp = await superAdmin.PostAsJsonAsync("/auth/permissions", new
        {
            name = "qa.inttest.create",
            description = "Integration test: create permission"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Created,
            "SUPER_ADMIN creating a valid permission must return 201 Created");

        var body = await resp.Content.ReadFromJsonAsync<PermissionResponseDto>();
        body.Should().NotBeNull();
        body!.Name.Should().Be("qa.inttest.create");
        body.Resource.Should().Be("qa",
            "resource is the segment before the first dot");
        body.Action.Should().Be("inttest.create",
            "action is everything after the first dot");
        body.Description.Should().Be("Integration test: create permission");
        body.Id.Should().NotBe(Guid.Empty);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreatePermission_ThreeSegmentName_ParsedCorrectly()
    {
        using var superAdmin = SuperAdminClient();

        var resp = await superAdmin.PostAsJsonAsync("/auth/permissions", new
        {
            name = "qa.inttest.three.segments",
            description = "Three-segment permission"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await resp.Content.ReadFromJsonAsync<PermissionResponseDto>();
        body!.Resource.Should().Be("qa");
        body.Action.Should().Be("inttest.three.segments",
            "action captures all segments after the first dot");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. POST /auth/permissions — duplicate → 409 Permission.Duplicate
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreatePermission_Duplicate_Returns409WithCode()
    {
        using var superAdmin = SuperAdminClient();

        // Create once
        await superAdmin.PostAsJsonAsync("/auth/permissions", new
        {
            name = "qa.inttest.dup",
            description = "First creation"
        });

        // Second attempt with the same name
        var resp = await superAdmin.PostAsJsonAsync("/auth/permissions", new
        {
            name = "qa.inttest.dup",
            description = "Duplicate attempt"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "duplicate name must return 409 Conflict");

        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("Permission.Duplicate",
            "error code must be Permission.Duplicate");
        body.Error.Should().Contain("already exists");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. POST /auth/permissions — bad name format → 400 Validation.Failed
    // ─────────────────────────────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Integration")]
    [InlineData("UPPERCASE")]           // not lowercase
    [InlineData("no-dot")]              // no dot separator
    [InlineData(".starts.with.dot")]    // leading dot
    [InlineData("ends.with.")]          // trailing dot
    [InlineData("has spaces.action")]   // spaces not allowed
    [InlineData("")]                    // empty
    public async Task CreatePermission_BadFormat_Returns400(string badName)
    {
        using var superAdmin = SuperAdminClient();

        var resp = await superAdmin.PostAsJsonAsync("/auth/permissions", new
        {
            name = badName,
            description = "Bad format test"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            $"name '{badName}' must fail validation with 400");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. PUT /auth/permissions/{id} — update description → 204
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdatePermission_SuperAdmin_Returns204()
    {
        using var superAdmin = SuperAdminClient();
        var id = await CreatePermissionAsync(superAdmin, "qa.inttest.update");

        var resp = await superAdmin.PutAsJsonAsync(
            $"/auth/permissions/{id}",
            new { description = "Updated by integration test" });

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "updating description must return 204 No Content");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdatePermission_NonExistentId_Returns404()
    {
        using var superAdmin = SuperAdminClient();

        var resp = await superAdmin.PutAsJsonAsync(
            $"/auth/permissions/{Guid.NewGuid()}",
            new { description = "Should not exist" });

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. DELETE /auth/permissions/{id} — unused → 204
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DeletePermission_Unused_Returns204()
    {
        using var superAdmin = SuperAdminClient();
        var id = await CreatePermissionAsync(superAdmin, "qa.inttest.deleteme");

        var resp = await superAdmin.DeleteAsync($"/auth/permissions/{id}");

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "deleting an unused permission must return 204");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DeletePermission_AlreadyDeleted_Returns404()
    {
        using var superAdmin = SuperAdminClient();
        var id = await CreatePermissionAsync(superAdmin, "qa.inttest.deletedtwice");

        await superAdmin.DeleteAsync($"/auth/permissions/{id}"); // first delete
        var resp = await superAdmin.DeleteAsync($"/auth/permissions/{id}"); // second

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "soft-deleted permission is not found on second delete attempt");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. DELETE /auth/permissions/{id} — in use by role → 409 Permission.InUse with count
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DeletePermission_InUseByRole_Returns409WithInUseCodeAndCount()
    {
        using var superAdmin = SuperAdminClient();

        // 6a. Create the permission to be deleted
        var permId = await CreatePermissionAsync(superAdmin, "qa.inttest.inuse");

        // 6b. Seed a custom role and grant the permission directly via DB
        //     (bypass the OrgContextGuard for setup — we own the DB in this test)
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();

        var role = AuthService.Domain.Entities.Role.CreateOrgRole(
            organizationId: TestOrgId,
            createdByUserId: Guid.NewGuid(),
            name: "qa_inuse_role",
            displayName: "QA In-Use Role");
        db.Roles.Add(role);
        await db.SaveChangesAsync(CancellationToken.None);

        var rp = AuthService.Domain.Entities.RolePermission.Create(role.Id, permId);
        db.RolePermissions.Add(rp);
        await db.SaveChangesAsync(CancellationToken.None);

        // 6c. Attempt to delete the permission — must be blocked
        var resp = await superAdmin.DeleteAsync($"/auth/permissions/{permId}");

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "deleting a permission that is granted to a role must return 409");

        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("Permission.InUse",
            "error code must be Permission.InUse");
        body.Error.Should().Contain("1 role",
            "the error message must include the count of roles holding this grant");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. AUTHZ: caller without platform.permissions.manage → 403
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task CreatePermission_ManagerWithoutPlatformManage_Returns403()
    {
        using var manager = ManagerClient();

        var resp = await manager.PostAsJsonAsync("/auth/permissions", new
        {
            name = "qa.manager.shouldfail",
            description = "Manager attempt — must be 403"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "caller without platform.permissions.manage must receive 403 on POST /auth/permissions");

        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("Auth.InsufficientPermission");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task UpdatePermission_ManagerWithoutPlatformManage_Returns403()
    {
        // Create a perm as superadmin first
        using var superAdmin = SuperAdminClient();
        var id = await CreatePermissionAsync(superAdmin, "qa.inttest.mgr.update");

        using var manager = ManagerClient();
        var resp = await manager.PutAsJsonAsync(
            $"/auth/permissions/{id}",
            new { description = "Manager update attempt" });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "caller without platform.permissions.manage must receive 403 on PUT");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task DeletePermission_ManagerWithoutPlatformManage_Returns403()
    {
        using var superAdmin = SuperAdminClient();
        var id = await CreatePermissionAsync(superAdmin, "qa.inttest.mgr.delete");

        using var manager = ManagerClient();
        var resp = await manager.DeleteAsync($"/auth/permissions/{id}");

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "caller without platform.permissions.manage must receive 403 on DELETE");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task CreatePermission_Unauthenticated_Returns401()
    {
        var resp = await _unauthenticated.PostAsJsonAsync("/auth/permissions", new
        {
            name = "qa.unauth.probe",
            description = "Unauthenticated attempt"
        });
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. Task A: Org.InvalidContext guard — zero-UUID or non-existent org → 409
    // ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgContext")]
    public async Task CreateOrgRole_ZeroUuidOrgId_Returns409OrgInvalidContext()
    {
        // Caller has org.roles.create but OrganizationId = Guid.Empty (all-zeros)
        // OrgContextGuard must catch this and return 409 instead of letting the DB throw 500.
        using var client = ZeroUuidOrgClient();

        var resp = await client.PostAsJsonAsync("/auth/org/roles", new
        {
            name = "qa_zero_uuid_role",
            displayName = "Zero UUID Test"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "zero-UUID org in JWT must return 409 Org.InvalidContext — NOT 500");

        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be(OrgContextGuard.ErrorCode,
            "error code must be Org.InvalidContext");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgContext")]
    public async Task CreateOrgRole_NonExistentOrgId_Returns409OrgInvalidContext()
    {
        // Caller has a plausible non-zero GUID that has no matching DB row
        using var client = NonExistentOrgClient();

        var resp = await client.PostAsJsonAsync("/auth/org/roles", new
        {
            name = "qa_noorg_role",
            displayName = "Non-Existent Org Test"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "non-existent org in JWT must return 409 Org.InvalidContext — NOT 500");

        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be(OrgContextGuard.ErrorCode);
        body.Error.Should().Contain("no longer valid");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgContext")]
    public async Task InviteMember_ZeroUuidOrgId_Returns409OrgInvalidContext()
    {
        using var client = ZeroUuidOrgClient();

        var resp = await client.PostAsJsonAsync("/auth/team/invite", new
        {
            email = "qa_invite_noorg@example.com",
            role = "CA"
        });

        // OrgContextGuard fires before the invite is created
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "invite with zero-UUID org must return 409 — NOT 500");

        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be(OrgContextGuard.ErrorCode);
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "OrgContext")]
    public async Task SuspendMember_ZeroUuidOrgId_NeverReturns500()
    {
        // SuspendOrgMemberCommand requires org.members.suspend; the ZeroUuidOrgClient
        // doesn't hold that permission, so PermissionBehavior fires first (403).
        // If the caller DID hold the perm, OrgContextGuard would fire (409).
        // In both cases the server must never return 500.
        using var client = ZeroUuidOrgClient();

        var resp = await client.PostAsJsonAsync(
            $"/auth/team/{Guid.NewGuid()}/suspend",
            new { });

        // Accept 403 (PermissionBehavior), 409 (OrgContextGuard), 404 (not found)
        // — anything but 500.
        resp.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.Conflict,
            HttpStatusCode.NotFound);
        ((int)resp.StatusCode).Should().BeLessThan(500,
            "zero-UUID org must never produce an unhandled 500");
    }
}

// ── Local DTOs for response parsing ─────────────────────────────────────────────
file record PermissionResponseDto(Guid Id, string Name, string Resource, string Action, string? Description);
file record ErrorDto(string Error, string Code);
