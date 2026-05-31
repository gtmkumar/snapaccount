using AuthService.Application.Admin.Commands.SetUserActiveAdmin;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the platform user activate/deactivate command (Team › Staff row
/// action, Screen 87). Covers the toggle, idempotency, the self-deactivate guard,
/// the last-super-admin guard, and not-found.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SetUserActiveAdminCommandTests : IDisposable
{
    private readonly AuthDbContext _db;

    public SetUserActiveAdminCommandTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private static Mock<ICurrentUser> CurrentUser(Guid id)
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(id);
        return m;
    }

    private async Task<User> SeedUser(bool active = true)
    {
        var user = new User { Email = $"{Guid.NewGuid():N}@snap.in", FullName = "Staffer" };
        if (!active) user.SetActive(false);
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    /// <summary>Gives <paramref name="userId"/> an active role holding the "*" wildcard permission.</summary>
    private async Task GrantWildcard(Guid userId)
    {
        var role = Role.Create($"ROLE_{Guid.NewGuid():N}", "Wildcard", isSystemRole: true);
        var perm = Permission.Create("*", "*", "*");
        _db.Roles.Add(role);
        _db.Permissions.Add(perm);
        await _db.SaveChangesAsync();
        _db.RolePermissions.Add(RolePermission.Create(role.Id, perm.Id));
        _db.UserRoles.Add(UserRole.Create(userId, role.Id));
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Deactivate_ActiveUser_SetsInactive()
    {
        var user = await SeedUser();
        var handler = new SetUserActiveAdminCommandHandler(_db, CurrentUser(Guid.NewGuid()).Object);

        var result = await handler.Handle(new SetUserActiveAdminCommand(user.Id, false), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await _db.Users.FindAsync(user.Id))!.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Reactivate_SuspendedUser_SetsActive()
    {
        var user = await SeedUser(active: false);
        var handler = new SetUserActiveAdminCommandHandler(_db, CurrentUser(Guid.NewGuid()).Object);

        var result = await handler.Handle(new SetUserActiveAdminCommand(user.Id, true), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await _db.Users.FindAsync(user.Id))!.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Deactivate_Self_IsRefused()
    {
        var user = await SeedUser();
        var handler = new SetUserActiveAdminCommandHandler(_db, CurrentUser(user.Id).Object);

        var result = await handler.Handle(new SetUserActiveAdminCommand(user.Id, false), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("User.SelfDelete");
    }

    [Fact]
    public async Task Deactivate_LastWildcardSuperAdmin_IsRefused()
    {
        var admin = await SeedUser();
        await GrantWildcard(admin.Id);
        var handler = new SetUserActiveAdminCommandHandler(_db, CurrentUser(Guid.NewGuid()).Object);

        var result = await handler.Handle(new SetUserActiveAdminCommand(admin.Id, false), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("User.LastAdmin");
        (await _db.Users.FindAsync(admin.Id))!.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Deactivate_OneOfTwoSuperAdmins_Succeeds()
    {
        var admin1 = await SeedUser();
        var admin2 = await SeedUser();
        await GrantWildcard(admin1.Id);
        await GrantWildcard(admin2.Id);
        var handler = new SetUserActiveAdminCommandHandler(_db, CurrentUser(Guid.NewGuid()).Object);

        var result = await handler.Handle(new SetUserActiveAdminCommand(admin1.Id, false), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await _db.Users.FindAsync(admin1.Id))!.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task UnknownUser_ReturnsNotFound()
    {
        var handler = new SetUserActiveAdminCommandHandler(_db, CurrentUser(Guid.NewGuid()).Object);

        var result = await handler.Handle(new SetUserActiveAdminCommand(Guid.NewGuid(), false), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("User.NotFound");
    }
}
