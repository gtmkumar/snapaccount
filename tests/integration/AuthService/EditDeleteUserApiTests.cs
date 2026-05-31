// Integration tests: Increment 1.4 Phase B — Admin Edit + Delete User
//
// Covers:
//   PUT /auth/admin/users/{id}
//     1. SUPER_ADMIN edits name + language + userType + active + KYC profile → 200, persisted
//     2. PAN supplied on edit → re-encrypted at rest (never plaintext), masked in GET detail
//     3. Edit role → role reassigned; GET detail reflects new roleId
//     4. Override perms reconciled (add + remove) on edit
//     5. AUTHZ: non-wildcard caller assigns platform/system role → 403 User.PrivilegeEscalation
//     6. AUTHZ: override beyond caller's set → 403 Role.PrivilegeEscalation
//     7. Missing user → 404
//     8. Unauthenticated → 401
//   DELETE /auth/admin/users/{id}
//     9. Self-delete → 409 User.SelfDelete
//    10. Last active wildcard SUPER_ADMIN → 409 User.LastAdmin
//    11. Normal user → 204; subsequently absent from list + GET detail 404
//   GET /auth/admin/users/{id}
//    12. Returns roleId + scope + override ids + masked PAN profile (edit prefill)

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
public class EditDeleteUserApiTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly PostgresFixture _pg = pg;
    private string _connectionString = null!;

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _unauthenticated = null!;

    private Guid _superAdminUserId = Guid.NewGuid();
    private Guid _managerUserId = Guid.NewGuid();
    private Guid _wildcardUserId = Guid.NewGuid();
    private Guid _systemAdminRoleId;
    private Guid _businessOwnerRoleId;
    private Guid _orgAdminRoleId;
    private Guid _superAdminRoleId;
    private Guid _testOrgId = Guid.NewGuid();
    private Guid _orgRolesReadPermId;
    private Guid _platformPermManagePermId;
    private Guid _mgrCustomRoleId;

    public async Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        var preSeedOpts = new DbContextOptionsBuilder<AuthService.Infrastructure.Persistence.AuthDbContext>()
            .UseNpgsql(_connectionString)
            .Options;
        using (var preSeedDb = new AuthService.Infrastructure.Persistence.AuthDbContext(preSeedOpts))
        {
            await preSeedDb.Database.EnsureCreatedAsync();
        }

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                builder.UseSetting("LOCAL_AUTH", "true");
                builder.UseSetting(
                    "ConnectionStrings:DefaultConnection",
                    _connectionString);

                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<DbContextOptions>();
                    services.RemoveAll<DbContextOptions<AuthService.Infrastructure.Persistence.AuthDbContext>>();
                    services.AddDbContext<AuthService.Infrastructure.Persistence.AuthDbContext>(opts =>
                        opts.UseNpgsql(_connectionString));

                    services.RemoveAll<IFirebaseAuthService>();
                    var fb = new Mock<IFirebaseAuthService>();
                    fb.Setup(f => f.CreateCustomTokenAsync(
                            It.IsAny<string>(), It.IsAny<Dictionary<string, object>>(),
                            It.IsAny<CancellationToken>()))
                        .ReturnsAsync(Result<string>.Success("fake-token"));
                    services.AddSingleton(fb.Object);
                });
            });

        var seedOpts = new DbContextOptionsBuilder<AuthService.Infrastructure.Persistence.AuthDbContext>()
            .UseNpgsql(_connectionString)
            .Options;
        using var seedDb = new AuthService.Infrastructure.Persistence.AuthDbContext(seedOpts);
        await SeedTestDataAsync(seedDb);

        _unauthenticated = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _unauthenticated.Dispose();
        await _factory.DisposeAsync();
    }

    // ── Seed ──────────────────────────────────────────────────────────────────

    private async Task SeedTestDataAsync(AuthService.Infrastructure.Persistence.AuthDbContext db)
    {
        _systemAdminRoleId   = AddRole(db, "MANAGER",        "Manager",        isSystem: true);
        _businessOwnerRoleId = AddRole(db, "BUSINESS_OWNER", "Business Owner", isSystem: true);
        _orgAdminRoleId      = AddRole(db, "ORG_ADMIN",      "Org Admin",      isSystem: true);
        // Distinct test-only name so it does NOT collide with the SUPER_ADMIN role that
        // LocalAuthService dev-seeds (LOCAL_AUTH=true) — otherwise admin@snapaccount.local
        // would also hold "*" and the "last wildcard admin" guard would see two holders.
        _superAdminRoleId    = AddRole(db, "WILDCARD_TEST",  "Wildcard Test",  isSystem: true);
        var mgrCustomRole    = AddRoleEntity(db, "MANAGER_ED_TEST", "Manager ED Test", isSystem: false);
        _mgrCustomRoleId     = mgrCustomRole.Id;

        var orgRolesReadPerm   = AddPerm(db, "org.roles.read",              "org",      "roles.read");
        var platformPermManage = AddPerm(db, "platform.permissions.manage", "platform", "permissions.manage");
        var wildcardPerm       = AddPerm(db, "*",                           "platform", "*");

        await db.SaveChangesAsync(CancellationToken.None);

        _orgRolesReadPermId       = orgRolesReadPerm.Id;
        _platformPermManagePermId = platformPermManage.Id;

        // SUPER_ADMIN role → wildcard "*"
        db.RolePermissions.Add(AuthService.Domain.Entities.RolePermission.Create(_superAdminRoleId, wildcardPerm.Id));
        // MANAGER role + manager custom role → org.roles.read (so it's grantable by those callers)
        db.RolePermissions.Add(AuthService.Domain.Entities.RolePermission.Create(_systemAdminRoleId, _orgRolesReadPermId));
        db.RolePermissions.Add(AuthService.Domain.Entities.RolePermission.Create(mgrCustomRole.Id, _orgRolesReadPermId));
        await db.SaveChangesAsync(CancellationToken.None);

        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.organization " +
            "(id,owner_user_id,business_name,country,is_gst_registered,is_msme_registered,is_active,created_at,updated_at) " +
            "VALUES ({0},{1},'EditDelete Test Org','India',false,false,true,now(),now()) ON CONFLICT(id) DO NOTHING",
            _testOrgId, Guid.NewGuid());

        await SeedUserRawAsync(db, _superAdminUserId, "super@editdelete.test");
        await SeedUserRawAsync(db, _managerUserId,    "manager@editdelete.test");
        await SeedUserRawAsync(db, _wildcardUserId,   "wildcard@editdelete.test");

        db.UserRoles.Add(AuthService.Domain.Entities.UserRole.Create(_managerUserId, mgrCustomRole.Id));
        // Manager is also an active member of the test org so OrgContextGuard passes
        // and org-scoped edits reach the delegation checks.
        db.OrganizationMembers.Add(
            AuthService.Domain.Entities.OrganizationMember.Create(_testOrgId, _managerUserId, mgrCustomRole.Id));
        // Wildcard holder via SUPER_ADMIN role — the only DB-level "*" holder.
        db.UserRoles.Add(AuthService.Domain.Entities.UserRole.Create(_wildcardUserId, _superAdminRoleId));
        await db.SaveChangesAsync(CancellationToken.None);
    }

    private static Guid AddRole(AuthService.Infrastructure.Persistence.AuthDbContext db,
        string name, string displayName, bool isSystem) => AddRoleEntity(db, name, displayName, isSystem).Id;

    private static AuthService.Domain.Entities.Role AddRoleEntity(
        AuthService.Infrastructure.Persistence.AuthDbContext db, string name, string displayName, bool isSystem)
    {
        var role = isSystem
            ? AuthService.Domain.Entities.Role.Create(name, displayName, isSystemRole: isSystem)
            : AuthService.Domain.Entities.Role.CreateOrgRole(
                organizationId: Guid.Empty, createdByUserId: Guid.NewGuid(),
                name: name, displayName: displayName);
        db.Roles.Add(role);
        return role;
    }

    private static AuthService.Domain.Entities.Permission AddPerm(
        AuthService.Infrastructure.Persistence.AuthDbContext db, string name, string resource, string action)
    {
        var perm = AuthService.Domain.Entities.Permission.Create(name, resource, action, $"Test: {name}");
        db.Permissions.Add(perm);
        return perm;
    }

    private static async Task SeedUserRawAsync(
        AuthService.Infrastructure.Persistence.AuthDbContext db, Guid userId, string email)
    {
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.user " +
            "(id,email,is_active,is_deleted,is_phone_verified,is_email_verified,preferred_language,created_at,updated_at) " +
            "VALUES ({0},{1},true,false,false,false,'en',now(),now()) ON CONFLICT(id) DO NOTHING",
            userId, email);
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.user_profile (id,user_id,user_type,country,kyc_status,created_at,updated_at) " +
            "VALUES (gen_random_uuid(),{0},'STAFF','India','PENDING',now(),now()) ON CONFLICT DO NOTHING",
            userId);
    }

    // ── Auth helpers ────────────────────────────────────────────────────────────

    private HttpClient AuthClient(Guid userId, Guid? orgId, string[] permissions, string[] roles)
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
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");
        return client;
    }

    private HttpClient SuperAdminClient() => AuthClient(_superAdminUserId, null, ["*"], ["SUPER_ADMIN"]);

    /// <summary>Creates a platform user with the given role, returns its id.</summary>
    private async Task<Guid> CreatePlatformUserAsync(HttpClient client, Guid roleId, object? profile = null, string[]? overrideIds = null)
    {
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + Guid.NewGuid().GetHashCode();
        var body = await PostCreate(client, new
        {
            fullName = "Edit Target",
            email = $"edit.target.{ts}@editdelete.test",
            scope = "platform",
            roleId = roleId.ToString(),
            permissionIds = overrideIds,
            profile,
        });
        return body!.UserId;
    }

    private static async Task<EdCreateUserResponseDto?> PostCreate(HttpClient client, object payload)
    {
        var resp = await client.PostAsJsonAsync("/auth/admin/users", payload);
        resp.StatusCode.Should().Be(HttpStatusCode.Created, await resp.Content.ReadAsStringAsync());
        return await resp.Content.ReadFromJsonAsync<EdCreateUserResponseDto>();
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Happy path edit
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateUser_SuperAdmin_ChangesFields_Returns200AndPersists()
    {
        using var client = SuperAdminClient();
        var userId = await CreatePlatformUserAsync(client, _businessOwnerRoleId);

        var resp = await client.PutAsJsonAsync($"/auth/admin/users/{userId}", new
        {
            fullName = "Renamed User",
            roleId = _businessOwnerRoleId.ToString(),
            preferredLanguage = "hi",
            userType = "STAFF",
            isActive = false,
            profile = new
            {
                aadhaarLast4 = "1234",
                city = "Mumbai",
                state = "Maharashtra",
                pincode = "400001",
                country = "IN",
            },
        });

        resp.StatusCode.Should().Be(HttpStatusCode.OK, await resp.Content.ReadAsStringAsync());

        var detail = await GetDetail(client, userId);
        detail!.Name.Should().Be("Renamed User");
        detail.PreferredLanguage.Should().Be("hi");
        detail.UserType.Should().Be("STAFF");
        detail.IsActive.Should().BeFalse();
        detail.Profile!.City.Should().Be("Mumbai");
        detail.Profile.State.Should().Be("Maharashtra");
        detail.Profile.Pincode.Should().Be("400001");
        detail.Profile.AadhaarLast4.Should().Be("1234");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. PAN encrypted at rest + masked on read
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "PAN")]
    public async Task UpdateUser_WithPan_EncryptsAtRest_AndMasksOnRead()
    {
        using var client = SuperAdminClient();
        var userId = await CreatePlatformUserAsync(client, _businessOwnerRoleId);

        const string pan = "ABCDE1234F";
        var resp = await client.PutAsJsonAsync($"/auth/admin/users/{userId}", new
        {
            fullName = "Pan User",
            roleId = _businessOwnerRoleId.ToString(),
            profile = new { panNumber = pan },
        });
        resp.StatusCode.Should().Be(HttpStatusCode.OK, await resp.Content.ReadAsStringAsync());

        // Stored value must NOT be the plaintext PAN
        using var dbScope = _factory.Services.CreateScope();
        var db = dbScope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        var stored = await db.UserProfiles
            .Where(p => p.UserId == userId).Select(p => p.PanNumber).FirstAsync();
        stored.Should().NotBeNullOrEmpty();
        stored.Should().NotBe(pan, "PAN must be encrypted at rest (SEC-013)");

        // Read API returns masked, not full PAN
        var detail = await GetDetail(client, userId);
        detail!.Profile!.PanMasked.Should().NotBeNull();
        detail.Profile.PanMasked.Should().NotBe(pan);
        detail.Profile.PanMasked.Should().Be("ABCDE****F");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Role reassignment
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateUser_ChangeRole_ReassignsRole()
    {
        using var client = SuperAdminClient();
        var userId = await CreatePlatformUserAsync(client, _businessOwnerRoleId);

        var resp = await client.PutAsJsonAsync($"/auth/admin/users/{userId}", new
        {
            fullName = "Role Change User",
            roleId = _systemAdminRoleId.ToString(),
        });
        resp.StatusCode.Should().Be(HttpStatusCode.OK, await resp.Content.ReadAsStringAsync());

        var detail = await GetDetail(client, userId);
        detail!.RoleId.Should().Be(_systemAdminRoleId);
        detail.RoleScope.Should().Be("platform");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. Override reconcile (add then remove)
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateUser_ReconcilesOverrides()
    {
        using var client = SuperAdminClient();
        var userId = await CreatePlatformUserAsync(client, _businessOwnerRoleId,
            overrideIds: [_orgRolesReadPermId.ToString()]);

        // Confirm prefill shows the override
        var before = await GetDetail(client, userId);
        before!.OverridePermissionIds.Should().Contain(_orgRolesReadPermId);

        // Edit removing all overrides
        var resp = await client.PutAsJsonAsync($"/auth/admin/users/{userId}", new
        {
            fullName = "Override User",
            roleId = _businessOwnerRoleId.ToString(),
            permissionIds = Array.Empty<string>(),
        });
        resp.StatusCode.Should().Be(HttpStatusCode.OK, await resp.Content.ReadAsStringAsync());

        var after = await GetDetail(client, userId);
        after!.OverridePermissionIds.Should().BeEmpty("overrides removed on edit must be soft-deleted");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. Escalation: non-wildcard assigns system role → 403
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Escalation")]
    public async Task UpdateUser_NonWildcardAssignsSystemRole_Returns403()
    {
        // Create the target as SUPER_ADMIN (org-scoped so editor can derive scope)
        using var admin = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var createBody = await PostCreate(admin, new
        {
            fullName = "Org Target",
            email = $"org.target.{ts}@editdelete.test",
            scope = "org",
            roleId = _orgAdminRoleId.ToString(),
            organizationId = _testOrgId.ToString(),
        });
        var userId = createBody!.UserId;

        // Non-wildcard caller holding platform.admins.invite tries to assign a system+platform role
        using var manager = AuthClient(_managerUserId, _testOrgId,
            ["platform.admins.invite", "org.roles.read"], ["MANAGER"]);

        var resp = await manager.PutAsJsonAsync($"/auth/admin/users/{userId}", new
        {
            fullName = "Org Target",
            roleId = _systemAdminRoleId.ToString(),
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await resp.Content.ReadFromJsonAsync<EdErrorResponseDto>();
        body!.Code.Should().Be("User.PrivilegeEscalation");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. Escalation: override beyond caller's set → 403
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Escalation")]
    public async Task UpdateUser_OverrideBeyondCallerSet_Returns403()
    {
        using var admin = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var createBody = await PostCreate(admin, new
        {
            fullName = "Org Target 2",
            email = $"org.target2.{ts}@editdelete.test",
            scope = "org",
            roleId = _orgAdminRoleId.ToString(),
            organizationId = _testOrgId.ToString(),
        });
        var userId = createBody!.UserId;

        using var manager = AuthClient(_managerUserId, _testOrgId,
            ["platform.admins.invite", "org.roles.read"], ["MANAGER"]);

        var resp = await manager.PutAsJsonAsync($"/auth/admin/users/{userId}", new
        {
            fullName = "Org Target 2",
            // Non-system role the manager IS allowed to assign (perms ⊆ caller set) so the
            // failure is specifically the override-escalation, not the platform-role gate.
            roleId = _mgrCustomRoleId.ToString(),
            permissionIds = new[] { _platformPermManagePermId.ToString() }, // not in caller's set
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await resp.Content.ReadFromJsonAsync<EdErrorResponseDto>();
        body!.Code.Should().Be("Role.PrivilegeEscalation");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. Missing user → 404
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateUser_MissingUser_Returns404()
    {
        using var client = SuperAdminClient();
        var resp = await client.PutAsJsonAsync($"/auth/admin/users/{Guid.NewGuid()}", new
        {
            fullName = "Ghost",
            roleId = _businessOwnerRoleId.ToString(),
        });
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateUser_Unauthenticated_Returns401()
    {
        var resp = await _unauthenticated.PutAsJsonAsync($"/auth/admin/users/{Guid.NewGuid()}", new
        {
            fullName = "Anon",
            roleId = _businessOwnerRoleId.ToString(),
        });
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. Self-delete → 409
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Delete")]
    public async Task DeleteUser_Self_Returns409()
    {
        using var client = SuperAdminClient();
        var resp = await client.DeleteAsync($"/auth/admin/users/{_superAdminUserId}");
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadFromJsonAsync<EdErrorResponseDto>();
        body!.Code.Should().Be("User.SelfDelete");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. Last wildcard admin → 409
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Delete")]
    public async Task DeleteUser_LastWildcardAdmin_Returns409()
    {
        // Caller is the mock SUPER_ADMIN (not a DB wildcard holder); target is the
        // only DB user holding "*" via the SUPER_ADMIN role → must be blocked.
        using var client = SuperAdminClient();
        var resp = await client.DeleteAsync($"/auth/admin/users/{_wildcardUserId}");
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict, await resp.Content.ReadAsStringAsync());
        var body = await resp.Content.ReadFromJsonAsync<EdErrorResponseDto>();
        body!.Code.Should().Be("User.LastAdmin");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 11. Normal user delete → 204 + gone
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DeleteUser_Normal_Returns204_ThenDetail404()
    {
        using var client = SuperAdminClient();
        var userId = await CreatePlatformUserAsync(client, _businessOwnerRoleId);

        var del = await client.DeleteAsync($"/auth/admin/users/{userId}");
        del.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var detail = await client.GetAsync($"/auth/admin/users/{userId}");
        detail.StatusCode.Should().Be(HttpStatusCode.NotFound, "soft-deleted users must be absent from detail");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 12. GET detail prefill shape
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetUserDetail_ReturnsRoleScopeOverridesAndMaskedPan()
    {
        using var client = SuperAdminClient();
        var userId = await CreatePlatformUserAsync(client, _businessOwnerRoleId,
            profile: new { panNumber = "AAAPL1234C" },
            overrideIds: [_orgRolesReadPermId.ToString()]);

        var detail = await GetDetail(client, userId);
        detail.Should().NotBeNull();
        detail!.RoleId.Should().Be(_businessOwnerRoleId);
        detail.RoleScope.Should().Be("platform");
        detail.OverridePermissionIds.Should().Contain(_orgRolesReadPermId);
        detail.Profile!.PanMasked.Should().Be("AAAPL****C");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 13. Users list = customers only (excludes platform-role staff) + userType filter
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task ListUsers_ExcludesStaff_AndFiltersByUserType()
    {
        using var client = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Staff: platform-scoped user → gets a platform user_role → must be EXCLUDED.
        var staffEmail = $"list.staff.{ts}@editdelete.test";
        await PostCreate(client, new
        {
            fullName = "List Staff", email = staffEmail,
            scope = "platform", roleId = _systemAdminRoleId.ToString(),
        });

        // Customer: org-scoped user (EMPLOYEE, no platform role) → must be INCLUDED.
        var custEmail = $"list.customer.{ts}@editdelete.test";
        await PostCreate(client, new
        {
            fullName = "List Customer", email = custEmail,
            scope = "org", roleId = _orgAdminRoleId.ToString(),
            organizationId = _testOrgId.ToString(), userType = "EMPLOYEE",
        });

        var all = await GetUserEmails(client, null);
        all.Should().Contain(custEmail, "org-scoped customer must appear in the Users list");
        all.Should().NotContain(staffEmail, "platform-role staff must be excluded from the Users list");

        // userType=BUSINESS_OWNER must exclude the EMPLOYEE customer.
        var ownersOnly = await GetUserEmails(client, "BUSINESS_OWNER");
        ownersOnly.Should().NotContain(custEmail, "EMPLOYEE customer must not appear under the BUSINESS_OWNER filter");
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    private static async Task<List<string>> GetUserEmails(HttpClient client, string? userType)
    {
        var url = "/auth/admin/users?page=1&pageSize=100" + (userType is null ? "" : $"&userType={userType}");
        var resp = await client.GetAsync(url);
        resp.StatusCode.Should().Be(HttpStatusCode.OK, await resp.Content.ReadAsStringAsync());
        var page = await resp.Content.ReadFromJsonAsync<EdUserListPage>();
        return page!.Items.Select(i => i.Email ?? "").ToList();
    }

    private static async Task<UserDetailDto?> GetDetail(HttpClient client, Guid userId)
    {
        var resp = await client.GetAsync($"/auth/admin/users/{userId}");
        resp.StatusCode.Should().Be(HttpStatusCode.OK, await resp.Content.ReadAsStringAsync());
        return await resp.Content.ReadFromJsonAsync<UserDetailDto>();
    }
}

// ── Local response DTOs (unique names to avoid clashing with other test files) ──
internal record EdCreateUserResponseDto(Guid UserId, string? Email, string Scope, Guid RoleId, List<string> GrantedPermissions);
internal record EdErrorResponseDto(string Error, string Code);
internal record EdUserListItem(Guid Id, string Name, string? Email, string? UserType);
internal record EdUserListPage(List<EdUserListItem> Items, int TotalCount);

internal record UserDetailDto(
    Guid Id, string Name, string? Phone, string? Email, bool IsActive,
    string? PreferredLanguage, string? UserType, DateTime JoinedAt,
    Guid? RoleId, string? RoleScope, Guid? RoleOrganizationId,
    List<Guid> OverridePermissionIds, UserProfileDto? Profile, object? Business);

internal record UserProfileDto(
    string? PanMasked, string? AadhaarLast4, DateOnly? DateOfBirth, string? Gender,
    string? AddressLine1, string? AddressLine2, string? City, string? State,
    string? Pincode, string? Country);
