// Integration tests: Increment 1.4 Phase A — Reference Data CRUD
//
// Covers:
//  1. GET /auth/reference-data — authenticated returns data; category filter; activeOnly
//  2. GET unauthenticated → 401
//  3. POST happy path → 201 with parsed body
//  4. POST duplicate (category,code) → 409 ReferenceData.Duplicate
//  5. POST STATE without parentCode → 400 ReferenceData.ParentCodeRequired
//  6. POST STATE with invalid parentCode → 400 ReferenceData.InvalidParentCode
//  7. PUT (name/sortOrder/isActive) → 204
//  8. DELETE unused → 204
//  9. DELETE InUse (entry referenced by user.preferred_language) → 409 ReferenceData.InUse
// 10. AUTHZ: manager (no platform.refdata.manage) → 403 on POST, PUT, DELETE
// 11. AUTHZ: manager GET → 200 (any authenticated user may read)
// 12. Validation: bad code format, bad category → 400

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

[Collection("RefDataApi")]
public class ReferenceDataApiTests : IAsyncLifetime
{
    // ─────────────────────────────────────────────────────────────────────
    // Infrastructure
    // ─────────────────────────────────────────────────────────────────────

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:17-alpine")
        .WithDatabase("snapaccount_refdata_test")
        .WithUsername("postgres")
        .WithPassword("postgres_refdata_test")
        .Build();

    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _unauthenticated = null!;

    // IDs of seeded test data (set during InitializeAsync)
    private Guid _countryInId;      // COUNTRY "IN" (India)
    private Guid _langEnId;         // LANGUAGE "en" (English)  — used by a user → InUse
    private Guid _genderMaleId;     // GENDER "MALE"
    private Guid _unusedCountryId;  // COUNTRY "QA_UNUSED" — no users reference it → deletable

    // A user whose preferred_language = "en" so that deleting "en" → 409
    private Guid _seededUserId = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        // ── Step 1: Create schema BEFORE factory (avoids EnsureDevAdminAsync race) ──
        var preSeedOpts = new DbContextOptionsBuilder<AuthService.Infrastructure.Persistence.AuthDbContext>()
            .UseNpgsql(_postgres.GetConnectionString())
            .Options;
        await using (var preSeedDb = new AuthService.Infrastructure.Persistence.AuthDbContext(preSeedOpts))
        {
            await preSeedDb.Database.EnsureCreatedAsync();
        }

        // ── Step 2: Seed reference data + a user via a direct DbContext ────────────
        await using (var seedDb = new AuthService.Infrastructure.Persistence.AuthDbContext(preSeedOpts))
        {
            await SeedDataAsync(seedDb);
        }

        // ── Step 3: Build factory (schema now exists) ─────────────────────────────
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
                builder.UseSetting("LOCAL_AUTH", "false");
                builder.UseSetting(
                    "ConnectionStrings:DefaultConnection",
                    _postgres.GetConnectionString());

                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<DbContextOptions>();
                    services.RemoveAll<DbContextOptions<AuthService.Infrastructure.Persistence.AuthDbContext>>();
                    services.AddDbContext<AuthService.Infrastructure.Persistence.AuthDbContext>(opts =>
                        opts.UseNpgsql(_postgres.GetConnectionString()));

                    services.RemoveAll<IFirebaseAuthService>();
                    var fb = new Mock<IFirebaseAuthService>();
                    fb.Setup(f => f.CreateCustomTokenAsync(
                            It.IsAny<string>(), It.IsAny<Dictionary<string, object>>(),
                            It.IsAny<CancellationToken>()))
                        .ReturnsAsync(Result<string>.Success("fake"));
                    services.AddSingleton(fb.Object);
                });
            });

        _unauthenticated = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _unauthenticated.Dispose();
        await _factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Seed helpers
    // ─────────────────────────────────────────────────────────────────────

    private async Task SeedDataAsync(AuthService.Infrastructure.Persistence.AuthDbContext db)
    {
        // Reference-data entries
        var countryIn = AuthService.Domain.Entities.ReferenceData.Create("COUNTRY", "IN", "India", null, 1);
        var langEn    = AuthService.Domain.Entities.ReferenceData.Create("LANGUAGE", "en", "English", null, 1);
        var genderM   = AuthService.Domain.Entities.ReferenceData.Create("GENDER", "MALE", "Male", null, 1);
        var qaUnused  = AuthService.Domain.Entities.ReferenceData.Create("COUNTRY", "QA_UNUSED", "QA Unused Country", null, 99);

        db.ReferenceData.AddRange(countryIn, langEn, genderM, qaUnused);
        await db.SaveChangesAsync(CancellationToken.None);

        _countryInId    = countryIn.Id;
        _langEnId       = langEn.Id;
        _genderMaleId   = genderM.Id;
        _unusedCountryId = qaUnused.Id;

        // Seed a user with preferred_language = "en" so deleting "en" → InUse.
        // The DeleteReferenceDataCommandHandler checks auth.user.preferred_language —
        // only the user row is needed; user_profile/user_preference are not checked for LANGUAGE.
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO auth.user " +
            "(id,email,is_active,is_phone_verified,is_email_verified,is_deleted,preferred_language,created_at,updated_at) " +
            "VALUES ({0},'refdata_test@adduser.test',true,false,false,false,'en',now(),now())",
            _seededUserId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Auth helpers
    // ─────────────────────────────────────────────────────────────────────

    private HttpClient SuperAdminClient() =>
        AuthClient(Guid.NewGuid(), null, ["*"], ["SUPER_ADMIN"]);

    private HttpClient ManagerClient() =>
        AuthClient(Guid.NewGuid(), null,
            ["org.roles.read", "org.members.invite"],   // no platform.refdata.manage
            ["MANAGER"]);

    private HttpClient AuthClient(Guid userId, Guid? orgId, string[] permissions, string[] roles)
    {
        var factory = _factory.WithWebHostBuilder(b =>
        {
            b.ConfigureServices(services =>
            {
                services.RemoveAll<ICurrentUser>();
                var m = new Mock<ICurrentUser>();
                m.Setup(u => u.IsAuthenticated).Returns(true);
                m.Setup(u => u.UserId).Returns(userId);
                m.Setup(u => u.OrganizationId).Returns(orgId);
                m.Setup(u => u.Roles).Returns(roles.ToList().AsReadOnly());
                m.Setup(u => u.Permissions).Returns(permissions.ToList().AsReadOnly());
                m.Setup(u => u.HasPermission(It.IsAny<string>()))
                    .Returns<string>(p => permissions.Contains("*") || permissions.Contains(p));
                m.Setup(u => u.IsInRole(It.IsAny<string>()))
                    .Returns<string>(r => roles.Contains(r));
                services.AddScoped(_ => m.Object);
            });
        });
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");
        return client;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. GET — authenticated returns data
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetReferenceData_Authenticated_Returns200WithItems()
    {
        using var client = SuperAdminClient();
        var resp = await client.GetAsync("/auth/reference-data");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await resp.Content.ReadFromJsonAsync<List<RefDataDto>>();
        items.Should().NotBeNull();
        items!.Count.Should().BeGreaterThan(0);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetReferenceData_CategoryFilter_ReturnsOnlyThatCategory()
    {
        using var client = SuperAdminClient();
        var resp = await client.GetAsync("/auth/reference-data?category=GENDER");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var items = await resp.Content.ReadFromJsonAsync<List<RefDataDto>>();
        items!.Should().AllSatisfy(i => i.Category.Should().Be("GENDER"));
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetReferenceData_ActiveOnlyTrue_ExcludesInactive()
    {
        // Deactivate GENDER MALE then fetch activeOnly=true
        using var client = SuperAdminClient();

        await client.PutAsJsonAsync(
            $"/auth/reference-data/{_genderMaleId}",
            new { isActive = false });

        var resp = await client.GetAsync("/auth/reference-data?category=GENDER&activeOnly=true");
        var items = await resp.Content.ReadFromJsonAsync<List<RefDataDto>>();

        items!.Should().NotContain(i => i.Id == _genderMaleId,
            "inactive entry must be excluded when activeOnly=true");

        // Restore
        await client.PutAsJsonAsync($"/auth/reference-data/{_genderMaleId}", new { isActive = true });
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetReferenceData_ActiveOnlyFalse_IncludesInactive()
    {
        using var client = SuperAdminClient();

        await client.PutAsJsonAsync(
            $"/auth/reference-data/{_genderMaleId}",
            new { isActive = false });

        var resp = await client.GetAsync("/auth/reference-data?category=GENDER&activeOnly=false");
        var items = await resp.Content.ReadFromJsonAsync<List<RefDataDto>>();

        items!.Should().Contain(i => i.Id == _genderMaleId,
            "inactive entry must appear when activeOnly=false");

        await client.PutAsJsonAsync($"/auth/reference-data/{_genderMaleId}", new { isActive = true });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. GET unauthenticated → 401
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetReferenceData_Unauthenticated_Returns401()
    {
        var resp = await _unauthenticated.GetAsync("/auth/reference-data");
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. POST happy path → 201
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateReferenceData_HappyPath_Returns201WithParsedBody()
    {
        using var client = SuperAdminClient();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category  = "COUNTRY",
            code      = $"QA{ts}",
            name      = "QA Test Nation",
            sortOrder = 50
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Created,
            "SUPER_ADMIN creating a valid entry must return 201");

        var body = await resp.Content.ReadFromJsonAsync<RefDataDto>();
        body.Should().NotBeNull();
        body!.Category.Should().Be("COUNTRY");
        body.Code.Should().Be($"QA{ts}");
        body.Name.Should().Be("QA Test Nation");
        body.IsActive.Should().BeTrue("new entry is active by default");
        body.SortOrder.Should().Be(50);
        body.Id.Should().NotBe(Guid.Empty);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. POST duplicate → 409 ReferenceData.Duplicate
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateReferenceData_DuplicateCategoryCode_Returns409Duplicate()
    {
        using var client = SuperAdminClient();

        // "IN" COUNTRY already seeded
        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category = "COUNTRY",
            code     = "IN",
            name     = "India Again"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "(COUNTRY, IN) already exists → 409");
        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("ReferenceData.Duplicate");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. POST STATE without parentCode → 400
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateReferenceData_StateWithoutParentCode_Returns400ParentRequired()
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category = "STATE",
            code     = "QA_ST_NOPARENT",
            name     = "QA State No Parent"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("ReferenceData.ParentCodeRequired");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. POST STATE with invalid parentCode → 400
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateReferenceData_StateWithInvalidParentCode_Returns400InvalidParent()
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category   = "STATE",
            code       = "QA_ST_BADPARENT",
            name       = "QA State Bad Parent",
            parentCode = "NONEXISTENT_COUNTRY"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("ReferenceData.InvalidParentCode");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. PUT (name/sortOrder/isActive) → 204
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateReferenceData_ValidPayload_Returns204()
    {
        using var client = SuperAdminClient();

        var resp = await client.PutAsJsonAsync(
            $"/auth/reference-data/{_genderMaleId}",
            new { name = "Male (Updated)", sortOrder = 10, isActive = true });

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "valid PUT must return 204");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateReferenceData_SetInactive_Returns204()
    {
        using var client = SuperAdminClient();

        var resp = await client.PutAsJsonAsync(
            $"/auth/reference-data/{_genderMaleId}",
            new { isActive = false });

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Verify it's actually inactive
        var getResp = await client.GetAsync("/auth/reference-data?category=GENDER&activeOnly=false");
        var items = await getResp.Content.ReadFromJsonAsync<List<RefDataDto>>();
        items!.First(i => i.Id == _genderMaleId).IsActive.Should().BeFalse();

        // Restore
        await client.PutAsJsonAsync($"/auth/reference-data/{_genderMaleId}", new { isActive = true });
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task UpdateReferenceData_NonExistentId_Returns404()
    {
        using var client = SuperAdminClient();

        var resp = await client.PutAsJsonAsync(
            $"/auth/reference-data/{Guid.NewGuid()}",
            new { name = "Ghost" });

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. DELETE unused → 204
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DeleteReferenceData_UnusedEntry_Returns204()
    {
        using var client = SuperAdminClient();

        var resp = await client.DeleteAsync($"/auth/reference-data/{_unusedCountryId}");

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "deleting an unused entry must return 204 (soft-deleted)");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task DeleteReferenceData_AlreadyDeleted_Returns404()
    {
        using var client = SuperAdminClient();

        // Create, delete once, then try again
        var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var createResp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category = "GENDER", code = $"QA_DEL_{ts}", name = "QA Delete Test"
        });
        var created = await createResp.Content.ReadFromJsonAsync<RefDataDto>();

        await client.DeleteAsync($"/auth/reference-data/{created!.Id}"); // first delete
        var secondDelete = await client.DeleteAsync($"/auth/reference-data/{created.Id}");

        secondDelete.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. DELETE InUse → 409 ReferenceData.InUse with count
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "InUseGuard")]
    public async Task DeleteReferenceData_LanguageEntryInUseByUser_Returns409WithCount()
    {
        using var client = SuperAdminClient();

        var resp = await client.DeleteAsync($"/auth/reference-data/{_langEnId}");

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "LANGUAGE 'en' is referenced by the seeded user → 409 InUse");
        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("ReferenceData.InUse");
        body.Error.Should().Contain("record(s)",
            "error message must state how many records reference the entry");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. AUTHZ: manager → 403 on POST, PUT, DELETE
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task CreateReferenceData_ManagerWithoutRefDataManage_Returns403()
    {
        using var client = ManagerClient();

        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category = "LANGUAGE", code = "MGR_TEST", name = "Manager Test"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await resp.Content.ReadFromJsonAsync<ErrorDto>();
        body!.Code.Should().Be("Auth.InsufficientPermission");
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task UpdateReferenceData_ManagerWithoutRefDataManage_Returns403()
    {
        using var client = ManagerClient();

        var resp = await client.PutAsJsonAsync(
            $"/auth/reference-data/{_countryInId}",
            new { name = "Hacked" });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Security", "RBAC")]
    public async Task DeleteReferenceData_ManagerWithoutRefDataManage_Returns403()
    {
        using var client = ManagerClient();

        var resp = await client.DeleteAsync($"/auth/reference-data/{_unusedCountryId}");

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 11. AUTHZ: manager GET → 200 (any authenticated user may read)
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetReferenceData_Manager_Returns200()
    {
        using var client = ManagerClient();

        var resp = await client.GetAsync("/auth/reference-data?category=COUNTRY");

        resp.StatusCode.Should().Be(HttpStatusCode.OK,
            "any authenticated user may read reference data — it drives dropdowns");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 12. Validation: bad code format, bad category → 400
    // ─────────────────────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Integration")]
    [InlineData("has space")]
    [InlineData("has.dot")]
    [InlineData("")]
    public async Task CreateReferenceData_BadCodeFormat_Returns400(string badCode)
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category = "COUNTRY",
            code     = badCode,
            name     = "Bad Code Country"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            $"code '{badCode}' must fail format validation");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task CreateReferenceData_InvalidCategory_Returns400()
    {
        using var client = SuperAdminClient();

        var resp = await client.PostAsJsonAsync("/auth/reference-data", new
        {
            category = "CITY",   // not in the allowed set
            code     = "NYC",
            name     = "New York"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}

// ── Local DTOs ────────────────────────────────────────────────────────────────

file record RefDataDto(
    Guid Id, string Category, string Code, string Name,
    string? ParentCode, bool IsActive, int SortOrder);

file record ErrorDto(string Error, string Code);
