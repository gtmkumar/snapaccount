// Integration tests: Increment 1.3 — Admin Add User
//
// Covers:
//   1. POST /auth/admin/users — SUPER_ADMIN creates platform user → 201, userId returned
//   2. Created user can local-login (initialPassword wired)
//   3. BUSINESS_OWNER (0 perms) + 1 override → effective perms = exactly 1
//   4. Scope=org → OrganizationMember row created + org-scoped user_permission
//   5. AUTHZ: manager (no platform.admins.invite) → 403 on POST
//   6. AUTHZ: User.PrivilegeEscalation — non-SUPER_ADMIN assigning platform/system role → 403
//   7. AUTHZ: Role.PrivilegeEscalation — override perms beyond caller's set → 403
//   8. GET /auth/admin/assignable-roles?scope=platform — non-SUPER_ADMIN → 403
//   9. Effective-perm resolver: direct user_permission appears in /auth/me/permissions
//  10. RETIRED (is_active=false) permission excluded from effective set even if directly granted
//  11. Duplicate email → 409 User.EmailConflict
//  12. Validation: empty fullName, invalid email, bad phone format → 400

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
public class AddUserApiTests(PostgresFixture pg) : IAsyncLifetime
{
    // ─────────────────────────────────────────────────────────────────────
    // Infrastructure
    // ─────────────────────────────────────────────────────────────────────

    private readonly PostgresFixture _pg = pg;
    private string _connectionString = null!;

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _unauthenticated = null!;

    // Seeded IDs available after InitializeAsync
    private Guid _superAdminUserId = Guid.NewGuid();
    private Guid _managerUserId = Guid.NewGuid();
    private Guid _systemAdminRoleId;
    private Guid _businessOwnerRoleId;
    private Guid _orgAdminRoleId;
    private Guid _mgrCustomRoleId;
    private Guid _testOrgId = Guid.NewGuid();
    private Guid _orgRolesReadPermId;
    private Guid _platformPermManagePermId;

    public async Task InitializeAsync()
    {
        // CreateUserAdminCommand reads LOCAL_AUTH from the OS env var (Application layer is
        // config-free by design) to decide whether to set the initial password. UseSetting
        // only populates IConfiguration, so set the env var too for the local-login tests.
        Environment.SetEnvironmentVariable("LOCAL_AUTH", "true");

        _connectionString = _pg.NewDatabaseConnectionString();

        // ── Step 1: Create the schema BEFORE the WebApplicationFactory builds.
        // The factory startup (Program.cs) runs LocalAuthService.EnsureDevAdminAsync which
        // queries auth.role. If the schema doesn't exist yet, startup crashes.
        // Solution: create schema via a direct DbContext BEFORE factory construction.
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
                builder.UseSetting("Auth:SessionSecret", "it-session-secret-for-testing-min32!!");
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                builder.UseSetting("LOCAL_AUTH", "true");       // needed for login + initialPassword
                // Override the connection string so BOTH EF Core AND Hangfire point to the test DB
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

        // ── Step 2: Seed test data via a direct DbContext (no DI interceptors)
        var seedOpts = new DbContextOptionsBuilder<AuthService.Infrastructure.Persistence.AuthDbContext>()
            .UseNpgsql(_connectionString)
            .Options;
        using var seedDb = new AuthService.Infrastructure.Persistence.AuthDbContext(seedOpts);
        await SeedTestDataAsync(seedDb);

        _unauthenticated = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        Environment.SetEnvironmentVariable("LOCAL_AUTH", null);
        _unauthenticated.Dispose();
        await _factory.DisposeAsync();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Seed helpers
    // ─────────────────────────────────────────────────────────────────────

    private async Task SeedTestDataAsync(AuthService.Infrastructure.Persistence.AuthDbContext db)
    {
        // Use EF Core entities directly to avoid raw-SQL schema-prefix issues.
        // EF Core tracks all inserts via the DbContext and saves to the mapped schema.

        // -- Roles
        _systemAdminRoleId   = AddRole(db, "SUPER_ADMIN",   "System Admin",    isSystem: true);
        _businessOwnerRoleId = AddRole(db, "BUSINESS_OWNER", "Business Owner",  isSystem: true);
        _orgAdminRoleId      = AddRole(db, "ORG_ADMIN",       "Org Admin",       isSystem: true);
        var mgrCustomRole    = AddRoleEntity(db, "MANAGER_ADDUSER_TEST", "Manager AddUser Test", isSystem: false);
        _mgrCustomRoleId     = mgrCustomRole.Id;

        // -- Permissions
        var orgRolesReadPerm     = AddPerm(db, "org.roles.read",             "org",      "roles.read");
        var platformPermManage   = AddPerm(db, "platform.permissions.manage","platform", "permissions.manage");

        await db.SaveChangesAsync(CancellationToken.None);

        _orgRolesReadPermId      = orgRolesReadPerm.Id;
        _platformPermManagePermId = platformPermManage.Id;

        // Grant org.roles.read to SUPER_ADMIN
        db.RolePermissions.Add(AuthService.Domain.Entities.RolePermission.Create(
            _systemAdminRoleId, _orgRolesReadPermId));
        // Grant org.roles.read to manager custom role
        db.RolePermissions.Add(AuthService.Domain.Entities.RolePermission.Create(
            mgrCustomRole.Id, _orgRolesReadPermId));

        await db.SaveChangesAsync(CancellationToken.None);

        // -- Org (for scope=org tests) via raw SQL (organization has no factory method due to private setters)
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.organization " +
            "(id,owner_user_id,business_name,country,is_gst_registered,is_msme_registered,is_active,created_at,updated_at) " +
            "VALUES ({0},{1},'AddUser Test Org','India',false,false,true,now(),now()) ON CONFLICT(id) DO NOTHING",
            _testOrgId, Guid.NewGuid());

        // -- Caller users: hash passwords via the static PasswordHasher (no DI needed)
        var superHash = AuthService.Infrastructure.Auth.PasswordHasher.Hash("SuperAdmin!123");
        var mgrHash   = AuthService.Infrastructure.Auth.PasswordHasher.Hash("Manager!123");
        await SeedUserRawAsync(db, _superAdminUserId, "super@adduser.test", superHash);
        await SeedUserRawAsync(db, _managerUserId,   "manager@adduser.test", mgrHash);

        // Manager UserRole
        db.UserRoles.Add(AuthService.Domain.Entities.UserRole.Create(_managerUserId, mgrCustomRole.Id));
        await db.SaveChangesAsync(CancellationToken.None);
    }

    // ── Entity factory helpers ────────────────────────────────────────────────

    private static Guid AddRole(
        AuthService.Infrastructure.Persistence.AuthDbContext db,
        string name, string displayName, bool isSystem)
    {
        var role = AddRoleEntity(db, name, displayName, isSystem);
        return role.Id;
    }

    private static AuthService.Domain.Entities.Role AddRoleEntity(
        AuthService.Infrastructure.Persistence.AuthDbContext db,
        string name, string displayName, bool isSystem)
    {
        var role = isSystem
            ? AuthService.Domain.Entities.Role.Create(name, displayName, isSystemRole: isSystem)
            : AuthService.Domain.Entities.Role.CreateOrgRole(
                organizationId: Guid.Empty,   // platform custom — null org not needed for tests
                createdByUserId: Guid.NewGuid(),
                name: name, displayName: displayName);
        db.Roles.Add(role);
        return role;
    }

    private static AuthService.Domain.Entities.Permission AddPerm(
        AuthService.Infrastructure.Persistence.AuthDbContext db,
        string name, string resource, string action)
    {
        var perm = AuthService.Domain.Entities.Permission.Create(name, resource, action, $"Test: {name}");
        db.Permissions.Add(perm);
        return perm;
    }

    private static async Task SeedUserRawAsync(
        AuthService.Infrastructure.Persistence.AuthDbContext db,
        Guid userId, string email, string passwordHash)
    {
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.user " +
            "(id,email,password_hash,is_active,is_deleted,is_phone_verified,is_email_verified,preferred_language,created_at,updated_at) " +
            "VALUES ({0},{1},{2},true,false,false,false,'en',now(),now()) ON CONFLICT(id) DO NOTHING",
            userId, email, passwordHash);
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.user_profile (id,user_id,user_type,country,kyc_status,created_at,updated_at) " +
            "VALUES (gen_random_uuid(),{0},'STAFF','India','PENDING',now(),now()) ON CONFLICT DO NOTHING",
            userId);
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.user_preference " +
            "(id,user_id,preferred_language,theme,push_notifications_enabled," +
            "sms_notifications_enabled,email_notifications_enabled,whatsapp_notifications_enabled,created_at,updated_at) " +
            "VALUES (gen_random_uuid(),{0},'en','light',true,true,true,true,now(),now()) ON CONFLICT DO NOTHING",
            userId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Auth helpers
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>Creates an HttpClient with the mock ICurrentUser returning the given claims.</summary>
    private HttpClient AuthClient(
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
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");
        return client;
    }

    private HttpClient SuperAdminClient() =>
        AuthClient(_superAdminUserId, null, ["*"], ["SUPER_ADMIN"]);

    private HttpClient ManagerClient() =>
        AuthClient(_managerUserId, _testOrgId,
            ["org.roles.read", "org.members.invite"],
            ["MANAGER"]);

    /// <summary>Creates a LOCAL_AUTH login token by calling the real login endpoint.</summary>
    private async Task<string?> LocalLoginAsync(string email, string password)
    {
        var resp = await _unauthenticated.PostAsJsonAsync("/auth/local/login",
            new { email, password });
        if (!resp.IsSuccessStatusCode) return null;
        var body = await resp.Content.ReadFromJsonAsync<LocalLoginDto>();
        return body?.AccessToken;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Happy path: SUPER_ADMIN creates platform user with SUPER_ADMIN role
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_SuperAdmin_Platform_SystemAdminRole_Returns201()
    {
        using var client = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "QA Platform Admin",
            email = $"qa.platform.{ts}@adduser.test",
            scope = "platform",
            roleId = _systemAdminRoleId.ToString(),
            initialPassword = "QaTest@123456"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Created,
            "SUPER_ADMIN creating a platform user with SUPER_ADMIN role must return 201");

        var body = await resp.Content.ReadFromJsonAsync<CreateUserResponseDto>();
        body.Should().NotBeNull();
        body!.UserId.Should().NotBe(Guid.Empty);
        body.Scope.Should().Be("platform");
        body.RoleId.Should().Be(_systemAdminRoleId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Created user can local-login with initialPassword
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_WithInitialPassword_CreatedUserCanLocalLogin()
    {
        using var client = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"qa.login.{ts}@adduser.test";
        const string password = "LoginTest@987654";

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "QA Login Test",
            email,
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString(),
            initialPassword = password
        });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);

        // Attempt login as the newly created user
        var token = await LocalLoginAsync(email, password);

        token.Should().NotBeNullOrWhiteSpace(
            "created user with initialPassword must be able to log in via LOCAL_AUTH");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. BUSINESS_OWNER (0 role perms) + 1 override → effective = exactly 1
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_BusinessOwnerRolePlusOneOverride_EffectivePermsExactlyOne()
    {
        using var adminClient = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"qa.override.{ts}@adduser.test";

        // BUSINESS_OWNER has 0 role permissions; add 1 direct override (org.roles.read)
        var createResp = await adminClient.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "QA Override User",
            email,
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString(),
            permissionIds = new[] { _orgRolesReadPermId.ToString() },
            initialPassword = "Override@123456"
        });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await createResp.Content.ReadFromJsonAsync<CreateUserResponseDto>();
        body!.GrantedPermissions.Should().HaveCount(1,
            "BUSINESS_OWNER has 0 role perms; exactly 1 override = 1 total direct grant");
        body.GrantedPermissions.Should().Contain("org.roles.read");

        // Login as new user and verify /auth/me/permissions
        var newToken = await LocalLoginAsync(email, "Override@123456");
        newToken.Should().NotBeNullOrWhiteSpace();

        var permClient = _factory.CreateClient();
        permClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", newToken!);
        var permResp = await permClient.GetAsync("/auth/me/permissions");

        permResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var perms = await permResp.Content.ReadFromJsonAsync<UserPermissionsResponseDto>();
        perms!.Permissions.Should().HaveCount(1,
            "org.roles.read direct grant = exactly 1 effective permission (role has 0)");
        perms.Permissions.Should().Contain("org.roles.read");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. Scope=org → OrganizationMember row created
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_OrgScope_CreatesOrganizationMemberRow()
    {
        using var client = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"qa.org.{ts}@adduser.test";

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "QA Org Member",
            email,
            scope = "org",
            roleId = _orgAdminRoleId.ToString(),
            organizationId = _testOrgId.ToString(),
            initialPassword = "OrgMember@123456"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Created,
            "SUPER_ADMIN creating org-scoped user must return 201");

        var body = await resp.Content.ReadFromJsonAsync<CreateUserResponseDto>();
        body!.Scope.Should().Be("org");

        // Verify OrganizationMember row exists in DB
        using var dbScope = _factory.Services.CreateScope();
        var db = dbScope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        var member = await db.OrganizationMembers
            .FirstOrDefaultAsync(m =>
                m.UserId == body.UserId &&
                m.OrganizationId == _testOrgId &&
                m.IsActive &&
                m.DeletedAt == null);
        member.Should().NotBeNull("scope=org must create an OrganizationMember row");
        member!.RoleId.Should().Be(_orgAdminRoleId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. Org-scope user_permission row scoped to that org
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_OrgScope_WithOverride_UserPermissionScopedToOrg()
    {
        using var client = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"qa.orgperm.{ts}@adduser.test";

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "QA Org Perm User",
            email,
            scope = "org",
            roleId = _businessOwnerRoleId.ToString(),
            organizationId = _testOrgId.ToString(),
            permissionIds = new[] { _orgRolesReadPermId.ToString() },
            initialPassword = "OrgPerm@123456"
        });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await resp.Content.ReadFromJsonAsync<CreateUserResponseDto>();

        using var dbScope = _factory.Services.CreateScope();
        var db = dbScope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        var up = await db.UserPermissions
            .FirstOrDefaultAsync(p =>
                p.UserId == body!.UserId &&
                p.PermissionId == _orgRolesReadPermId &&
                p.DeletedAt == null);

        up.Should().NotBeNull("override permission grant must be persisted");
        up!.OrganizationId.Should().Be(_testOrgId,
            "org-scoped permission grant must have OrganizationId set");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. AUTHZ: manager (no platform.admins.invite) → 403
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task CreateUser_ManagerWithoutPlatformAdminsInvite_Returns403()
    {
        using var client = ManagerClient();

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Hack Attempt",
            email = "hack@evil.test",
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString()
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "caller without platform.admins.invite must receive 403");
        var body = await resp.Content.ReadFromJsonAsync<ErrorResponseDto>();
        body!.Code.Should().Be("Auth.InsufficientPermission");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. AUTHZ: User.PrivilegeEscalation — non-SUPER_ADMIN assigns system role → 403
    //    (tested via mock with platform.admins.invite but NOT wildcard)
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Escalation")]
    public async Task CreateUser_NonSuperAdminAssignsSystemRole_Returns403UserPrivilegeEscalation()
    {
        // A caller who holds platform.admins.invite (passes PermissionBehavior)
        // but NOT wildcard → non-SUPER_ADMIN.
        // Assigning a system role (is_system_role=true) should return User.PrivilegeEscalation.
        using var client = AuthClient(
            _managerUserId, _testOrgId,
            // Has platform.admins.invite explicitly, but NOT "*"
            permissions: ["platform.admins.invite", "org.roles.read"],
            roles: ["MANAGER"]);

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Escalation Test",
            email = $"qa.esc.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}@test.local",
            scope = "platform",
            roleId = _systemAdminRoleId.ToString()  // SUPER_ADMIN = system role
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "non-SUPER_ADMIN cannot assign system roles → User.PrivilegeEscalation");
        var body = await resp.Content.ReadFromJsonAsync<ErrorResponseDto>();
        body!.Code.Should().Be("User.PrivilegeEscalation");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. AUTHZ: Role.PrivilegeEscalation — override perms beyond caller's set → 403
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "Escalation")]
    public async Task CreateUser_OverridePermBeyondCallerSet_Returns403RolePrivilegeEscalation()
    {
        // Caller holds platform.admins.invite + org.roles.read but NOT platform.permissions.manage.
        // Assign a NON-system role (perms ⊆ caller's set) so the request reaches the OVERRIDE
        // delegation check — otherwise the wildcard-only system-role gate (I1.3-001) fires first
        // and returns User.PrivilegeEscalation. Granting platform.permissions.manage as an
        // override (beyond the caller's set) is the escalation under test.
        using var client = AuthClient(
            _managerUserId, null,
            permissions: ["platform.admins.invite", "org.roles.read"],  // no platform.permissions.manage
            roles: ["MANAGER"]);

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Override Escalation",
            email = $"qa.overesc.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}@test.local",
            scope = "platform",
            roleId = _mgrCustomRoleId.ToString(),
            permissionIds = new[] { _platformPermManagePermId.ToString() }  // not in caller's set
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "granting an override permission beyond caller's effective set = Role.PrivilegeEscalation");
        var body = await resp.Content.ReadFromJsonAsync<ErrorResponseDto>();
        body!.Code.Should().Be("Role.PrivilegeEscalation");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. GET /auth/admin/assignable-roles?scope=platform — non-super-admin → 403
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task GetAssignableRoles_PlatformScope_ManagerReturns403()
    {
        using var client = ManagerClient();

        var resp = await client.GetAsync("/auth/admin/assignable-roles?scope=platform");

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "manager without platform.admins.invite cannot request platform-scope assignable roles");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetAssignableRoles_PlatformScope_SuperAdminReturns200WithRoles()
    {
        using var client = SuperAdminClient();

        var resp = await client.GetAsync("/auth/admin/assignable-roles?scope=platform");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var roles = await resp.Content.ReadFromJsonAsync<List<AssignableRoleDto>>();
        roles.Should().NotBeNull();
        roles!.Count.Should().BeGreaterThan(0,
            "system roles must be visible to SUPER_ADMIN for platform scope");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. Effective-perm resolver: direct user_permission appears in /auth/me/permissions
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DirectUserPermission_AppearsInGetMePermissions()
    {
        // Create a user with BUSINESS_OWNER (0 perms) + direct override
        using var adminClient = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"qa.direct.{ts}@adduser.test";

        var createResp = await adminClient.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Direct Perm User",
            email,
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString(),
            permissionIds = new[] { _orgRolesReadPermId.ToString() },
            initialPassword = "Direct@123456"
        });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var newToken = await LocalLoginAsync(email, "Direct@123456");
        newToken.Should().NotBeNullOrWhiteSpace();

        var permClient = _factory.CreateClient();
        permClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", newToken!);

        var permResp = await permClient.GetAsync("/auth/me/permissions");
        permResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await permResp.Content.ReadFromJsonAsync<UserPermissionsResponseDto>();

        dto!.Permissions.Should().Contain("org.roles.read",
            "direct user_permission grant must appear in /auth/me/permissions (Leg 3 of EffectivePermissionResolver)");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 11. RETIRED permission excluded from effective set even if directly granted
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task RetiredPermission_ExcludedFromEffectiveSet_EvenIfDirectlyGranted()
    {
        // Create a user with a direct grant to org.roles.read
        using var adminClient = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"qa.retired.{ts}@adduser.test";

        var createResp = await adminClient.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Retired Perm User",
            email,
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString(),
            permissionIds = new[] { _orgRolesReadPermId.ToString() },
            initialPassword = "Retired@123456"
        });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var newToken = await LocalLoginAsync(email, "Retired@123456");
        newToken.Should().NotBeNullOrWhiteSpace();

        // Retire the permission (set is_active=false)
        using var dbScope = _factory.Services.CreateScope();
        var db = dbScope.ServiceProvider
            .GetRequiredService<AuthService.Infrastructure.Persistence.AuthDbContext>();
        var perm = await db.Permissions.FirstAsync(p => p.Id == _orgRolesReadPermId);
        perm.SetActive(false);
        await db.SaveChangesAsync(CancellationToken.None);

        try
        {
            var permClient = _factory.CreateClient();
            permClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", newToken!);

            var permResp = await permClient.GetAsync("/auth/me/permissions");
            var dto = await permResp.Content.ReadFromJsonAsync<UserPermissionsResponseDto>();

            dto!.Permissions.Should().NotContain("org.roles.read",
                "RETIRED (is_active=false) permissions must be excluded from effective set " +
                "even when a direct user_permission grant exists");
            dto.Permissions.Should().BeEmpty(
                "BUSINESS_OWNER has no role perms; the only direct grant is retired → empty effective set");
        }
        finally
        {
            // Always restore — other tests depend on this permission being active
            perm.SetActive(true);
            await db.SaveChangesAsync(CancellationToken.None);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 12. Duplicate email → 409 User.EmailConflict
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_DuplicateEmail_Returns409EmailConflict()
    {
        using var client = SuperAdminClient();
        var email = $"qa.dup.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}@adduser.test";

        // First creation
        await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "User One",
            email,
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString()
        });

        // Second with same email
        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "User Two",
            email,
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString()
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadFromJsonAsync<ErrorResponseDto>();
        body!.Code.Should().Be("User.EmailConflict");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 13. Validation: missing required fields → 400
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_EmptyFullName_Returns400()
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "",
            email = "valid@test.local",
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString()
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_InvalidEmailFormat_Returns400()
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Valid Name",
            email = "not-an-email",
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString()
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_OrgScopeWithoutOrganizationId_Returns400()
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Missing Org",
            email = "missingorg@test.local",
            scope = "org",
            roleId = _businessOwnerRoleId.ToString()
            // no organizationId
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateUser_Unauthenticated_Returns401()
    {
        var resp = await _unauthenticated.PostAsJsonAsync("/auth/admin/users", new
        {
            fullName = "Anon",
            email = "anon@test.local",
            scope = "platform",
            roleId = _businessOwnerRoleId.ToString()
        });
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}

// ── Local response DTOs ──────────────────────────────────────────────────────
file record CreateUserResponseDto(
    Guid UserId,
    string? Email,
    string Scope,
    Guid RoleId,
    List<string> GrantedPermissions);

file record UserPermissionsResponseDto(
    string UserId,
    List<string> Roles,
    List<string> Permissions);

file record AssignableRoleDto(
    Guid Id, string Name, string DisplayName,
    bool IsSystemRole, int PermissionCount);

file record ErrorResponseDto(string Error, string Code);

file record LocalLoginDto(
    // /auth/local/login returns the session JWT under "token" (matches admin/mobile client contract).
    [property: System.Text.Json.Serialization.JsonPropertyName("token")]
    string AccessToken);
