using AuthService.Application.Common.Helpers;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for Allow/Deny resolution (gap #2). Effective = allows − denies,
/// deny wins globally across roles + direct grants; the "*" wildcard is not
/// constrained by deny; pre-043 (allow) behaviour is unchanged.
/// </summary>
[Trait("Category", "Unit")]
public sealed class EffectivePermissionResolverTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Guid _userId = Guid.NewGuid();

    public EffectivePermissionResolverTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private async Task<Permission> Perm(string name)
    {
        var p = Permission.Create(name, name.Split('.')[0], name);
        _db.Permissions.Add(p);
        await _db.SaveChangesAsync();
        return p;
    }

    /// <summary>Creates a role with the given (permission, isAllowed) grants and assigns it to the user.</summary>
    private async Task<Role> RoleWith(params (Permission perm, bool allow)[] grants)
    {
        var role = Role.Create($"ROLE_{Guid.NewGuid():N}", "Role", isSystemRole: true);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync();
        foreach (var (perm, allow) in grants)
            _db.RolePermissions.Add(RolePermission.Create(role.Id, perm.Id, allow));
        _db.UserRoles.Add(UserRole.Create(_userId, role.Id));
        await _db.SaveChangesAsync();
        return role;
    }

    private async Task DirectGrant(Permission perm, bool allow)
    {
        _db.UserPermissions.Add(UserPermission.Create(_userId, perm.Id, null, Guid.NewGuid(), allow));
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task AllowsOnly_BehaveAsUnionUnchanged()
    {
        var read = await Perm("document.read");
        var write = await Perm("document.update");
        await RoleWith((read, true), (write, true));

        var perms = await EffectivePermissionResolver.ResolveAsync(_db, _userId, null, CancellationToken.None);

        perms.Should().BeEquivalentTo("document.read", "document.update");
    }

    [Fact]
    public async Task UserDeny_OverridesRoleAllow()
    {
        var read = await Perm("document.read");
        var del = await Perm("document.delete");
        await RoleWith((read, true), (del, true));   // role allows both
        await DirectGrant(del, allow: false);          // user is explicitly denied delete

        var perms = await EffectivePermissionResolver.ResolveAsync(_db, _userId, null, CancellationToken.None);

        perms.Should().Contain("document.read");
        perms.Should().NotContain("document.delete");
    }

    [Fact]
    public async Task RoleDeny_OverridesAnotherRoleAllow()
    {
        var file = await Perm("gst.returns.file");
        await RoleWith((file, true));    // role A allows
        await RoleWith((file, false));   // role B denies → deny wins

        var perms = await EffectivePermissionResolver.ResolveAsync(_db, _userId, null, CancellationToken.None);

        perms.Should().NotContain("gst.returns.file");
    }

    [Fact]
    public async Task Wildcard_IsNotConstrainedByDeny()
    {
        var star = await Perm("*");
        var del = await Perm("document.delete");
        await RoleWith((star, true));
        await DirectGrant(del, allow: false); // deny a concrete perm

        var perms = await EffectivePermissionResolver.ResolveAsync(_db, _userId, null, CancellationToken.None);

        // "*" remains; the deny only removes the concrete name (which wasn't an allow anyway).
        perms.Should().Contain("*");
        perms.Should().NotContain("document.delete");
    }

    [Fact]
    public async Task ReDeniedThenNotGranted_IsAbsent()
    {
        // A perm that is only ever denied (no allow leg) simply doesn't appear.
        var p = await Perm("loan.approve");
        await RoleWith((p, false));

        var perms = await EffectivePermissionResolver.ResolveAsync(_db, _userId, null, CancellationToken.None);

        perms.Should().NotContain("loan.approve");
    }
}
