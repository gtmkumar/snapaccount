using System.Text.Json;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SnapAccount.Shared.Infrastructure.Auth;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests the production session-JWT issuance (FirebaseAuthService.CreateCustomTokenAsync) and the
/// shared FirebaseAuthMiddleware's session-JWT validation path — i.e. the backend-issued session
/// JWT that replaced unusable Firebase custom tokens (Bug C).
/// </summary>
[Trait("Category", "Unit")]
public sealed class FirebaseAuthServiceSessionTokenTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly IConfiguration _config = new ConfigurationBuilder().Build(); // no DEV flags → production branch
    private readonly FirebaseAuthService _sut;

    public FirebaseAuthServiceSessionTokenTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
        _sut = new FirebaseAuthService(NullLogger<FirebaseAuthService>.Instance, _config, _db);
    }

    public void Dispose() => _db.Dispose();

    private string Secret => SessionTokenSecret.Resolve(_config);

    private static IDictionary<string, object> Claims(Guid userId) =>
        new Dictionary<string, object> { ["userId"] = userId.ToString() };

    [Fact]
    public async Task Production_ResolvesRolePermissions_IntoSessionJwt()
    {
        var user = new User { Email = "owner@test.com", FullName = "Owner" };
        _db.Users.Add(user);
        var perm = Permission.Create("users.view", "users", "View users");
        _db.Permissions.Add(perm);
        var role = Role.Create("ORG_MANAGER", "Manager", isSystemRole: true);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync();
        _db.RolePermissions.Add(RolePermission.Create(role.Id, perm.Id, true));
        _db.UserRoles.Add(UserRole.Create(user.Id, role.Id));
        await _db.SaveChangesAsync();

        var result = await _sut.CreateCustomTokenAsync("fb-uid", Claims(user.Id));

        result.IsSuccess.Should().BeTrue();
        var payload = LocalJwt.Validate(result.Value, Secret);
        payload.Should().NotBeNull("token must validate with the shared session secret");

        var perms = Perms(payload!.Value);
        perms.Should().Contain("users.view");
        perms.Should().NotContain("*", "non-super-admin must get concrete permissions, not wildcard");
        Roles(payload.Value).Should().Contain("ORG_MANAGER");
        payload.Value.GetProperty("userId").GetString().Should().Be(user.Id.ToString());
    }

    [Fact]
    public async Task Production_SuperAdmin_GetsWildcard()
    {
        var user = new User { Email = "super@test.com" };
        _db.Users.Add(user);
        var role = Role.Create("SUPER_ADMIN", "Super Admin", isSystemRole: true);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync();
        _db.UserRoles.Add(UserRole.Create(user.Id, role.Id));
        await _db.SaveChangesAsync();

        var result = await _sut.CreateCustomTokenAsync("fb-uid", Claims(user.Id));

        result.IsSuccess.Should().BeTrue();
        var payload = LocalJwt.Validate(result.Value, Secret)!.Value;
        Perms(payload).Should().ContainSingle().Which.Should().Be("*");
    }

    [Fact]
    public async Task Production_NoRoles_IssuesTokenWithEmptyPermissions()
    {
        // A brand-new social/OTP user with no org yet → valid session, zero permissions (onboarding only).
        var user = new User { Email = "new@test.com" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var result = await _sut.CreateCustomTokenAsync("fb-uid", Claims(user.Id));

        result.IsSuccess.Should().BeTrue();
        var payload = LocalJwt.Validate(result.Value, Secret)!.Value;
        Perms(payload).Should().BeEmpty();
        payload.GetProperty("userId").GetString().Should().Be(user.Id.ToString());
    }

    [Fact]
    public async Task Production_MissingUserIdClaim_Fails()
    {
        var result = await _sut.CreateCustomTokenAsync("fb-uid", claims: null);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Session.MissingUser");
    }

    [Fact]
    public async Task IssuedToken_TamperedSignature_FailsValidation()
    {
        var user = new User { Email = "t@test.com" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = (await _sut.CreateCustomTokenAsync("fb-uid", Claims(user.Id))).Value;
        var tampered = token[..^2] + (token[^1] == 'a' ? "bb" : "aa");

        LocalJwt.Validate(tampered, Secret).Should().BeNull();
    }

    private static List<string> Perms(JsonElement payload) =>
        payload.GetProperty("permissions").EnumerateArray().Select(e => e.GetString()!).ToList();

    private static List<string> Roles(JsonElement payload) =>
        payload.GetProperty("roles").EnumerateArray().Select(e => e.GetString()!).ToList();
}

/// <summary>
/// Tests that the shared middleware accepts a SnapAccount session JWT and never 500s on a bad token.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SessionJwtMiddlewareTests
{
    private static readonly IConfiguration Config = new ConfigurationBuilder().Build();

    private static FirebaseAuthMiddleware Middleware(RequestDelegate next) =>
        new(next, NullLogger<FirebaseAuthMiddleware>.Instance, Config);

    private static string IssueSessionJwt(Guid userId, params string[] permissions) =>
        LocalJwt.Issue(
            new Dictionary<string, object?>
            {
                ["userId"]         = userId.ToString(),
                ["organizationId"] = Guid.NewGuid().ToString(),
                ["roles"]          = new[] { "ORG_MANAGER" },
                ["permissions"]    = permissions,
                ["firebase_uid"]   = $"sess:{userId}",
            },
            SessionTokenSecret.Resolve(Config),
            TimeSpan.FromMinutes(10));

    [Fact]
    public async Task ValidSessionJwt_PopulatesContext()
    {
        var userId = Guid.NewGuid();
        var token = IssueSessionJwt(userId, "users.view");

        var nextCalled = false;
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["Authorization"] = $"Bearer {token}";

        await Middleware(_ => { nextCalled = true; return Task.CompletedTask; }).InvokeAsync(ctx);

        nextCalled.Should().BeTrue();
        ctx.Items["FirebaseUid"].Should().Be($"sess:{userId}");
        ctx.User.Identity!.AuthenticationType.Should().Be("SessionJwt");

        var claims = (IReadOnlyDictionary<string, object>)ctx.Items["FirebaseClaims"]!;
        var perms = ((JsonElement)claims["permissions"]).EnumerateArray().Select(e => e.GetString()).ToList();
        perms.Should().Contain("users.view");
    }

    [Fact]
    public async Task TamperedSessionJwt_LeavesUnauthenticated_NoException()
    {
        var token = IssueSessionJwt(Guid.NewGuid(), "users.view");
        var tampered = token[..^2] + "zz";

        var nextCalled = false;
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["Authorization"] = $"Bearer {tampered}";

        await Middleware(_ => { nextCalled = true; return Task.CompletedTask; }).InvokeAsync(ctx);

        nextCalled.Should().BeTrue("middleware must not short-circuit");
        ctx.Items.ContainsKey("FirebaseUid").Should().BeFalse("tampered token leaves request unauthenticated");
    }

    [Fact]
    public async Task MalformedBearer_DoesNotThrow()
    {
        var nextCalled = false;
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["Authorization"] = "Bearer not-a-jwt";

        var act = async () => await Middleware(_ => { nextCalled = true; return Task.CompletedTask; }).InvokeAsync(ctx);

        await act.Should().NotThrowAsync("a malformed bearer must never surface as a 500");
        nextCalled.Should().BeTrue();
        ctx.Items.ContainsKey("FirebaseUid").Should().BeFalse();
    }

    [Fact]
    public async Task NoAuthHeader_PassesThroughUnauthenticated()
    {
        var nextCalled = false;
        var ctx = new DefaultHttpContext();

        await Middleware(_ => { nextCalled = true; return Task.CompletedTask; }).InvokeAsync(ctx);

        nextCalled.Should().BeTrue();
        ctx.Items.ContainsKey("FirebaseUid").Should().BeFalse();
    }
}
