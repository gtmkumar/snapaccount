using AuthService.Application.Admin.Commands.UpdateUserAdmin;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for per-user deny overrides (gap #2 completion). A deny override is
/// a user_permission row with is_allowed=false that subtracts a role-granted perm.
/// Runs as SUPER_ADMIN ("*") so org-context + delegation guards are bypassed.
/// </summary>
[Trait("Category", "Unit")]
public sealed class UpdateUserAdminDenyOverrideTests : IDisposable
{
    private readonly AuthDbContext _db;

    public UpdateUserAdminDenyOverrideTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private static ICurrentUser SuperAdmin()
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(Guid.NewGuid());
        m.SetupGet(x => x.OrganizationId).Returns((Guid?)null);
        m.SetupGet(x => x.IsAuthenticated).Returns(true);
        m.SetupGet(x => x.Permissions).Returns(new[] { "*" });
        m.Setup(x => x.HasPermission(It.IsAny<string>())).Returns(true);
        return m.Object;
    }

    /// <summary>Seeds a user holding a platform role, plus two permissions.</summary>
    private async Task<(User user, Role role, Permission p1, Permission p2)> Seed()
    {
        var user = new User { Email = "staff@snap.in", FullName = "Staff" };
        var role = Role.Create($"R_{Guid.NewGuid():N}", "Role", isSystemRole: true);
        var p1 = Permission.Create("gst.returns.file", "gst", "returns.file");
        var p2 = Permission.Create("gst.returns.approve", "gst", "returns.approve");
        _db.Users.Add(user); _db.Roles.Add(role); _db.Permissions.AddRange(p1, p2);
        await _db.SaveChangesAsync();
        _db.RolePermissions.AddRange(
            RolePermission.Create(role.Id, p1.Id), RolePermission.Create(role.Id, p2.Id));
        _db.UserRoles.Add(UserRole.Create(user.Id, role.Id));
        await _db.SaveChangesAsync();
        return (user, role, p1, p2);
    }

    private UpdateUserAdminCommand Cmd(Guid userId, Guid roleId,
        IReadOnlyList<Guid>? allow = null, IReadOnlyList<Guid>? deny = null)
        => new(userId, "Staff", roleId, allow, DeniedPermissionIds: deny);

    [Fact]
    public async Task DenyOverride_PersistsAsInactiveUserPermission()
    {
        var (user, role, p1, _) = await Seed();
        var handler = new UpdateUserAdminCommandHandler(_db, SuperAdmin(), new Mock<IPanEncryptionService>().Object);

        var result = await handler.Handle(Cmd(user.Id, role.Id, deny: [p1.Id]), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var row = await _db.UserPermissions.SingleAsync(up => up.UserId == user.Id && up.PermissionId == p1.Id && up.DeletedAt == null);
        row.IsAllowed.Should().BeFalse();
    }

    [Fact]
    public async Task ReSave_FlipsDenyToAllow_AndRemovesOmitted()
    {
        var (user, role, p1, p2) = await Seed();
        var handler = new UpdateUserAdminCommandHandler(_db, SuperAdmin(), new Mock<IPanEncryptionService>().Object);

        // First: deny p1, allow-override p2.
        await handler.Handle(Cmd(user.Id, role.Id, allow: [p2.Id], deny: [p1.Id]), CancellationToken.None);
        (await _db.UserPermissions.SingleAsync(up => up.PermissionId == p1.Id && up.DeletedAt == null)).IsAllowed.Should().BeFalse();

        // Then: p1 flips to allow, p2 omitted (removed).
        var result = await handler.Handle(Cmd(user.Id, role.Id, allow: [p1.Id], deny: []), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await _db.UserPermissions.SingleAsync(up => up.PermissionId == p1.Id && up.DeletedAt == null)).IsAllowed.Should().BeTrue();
        (await _db.UserPermissions.FirstOrDefaultAsync(up => up.PermissionId == p2.Id && up.DeletedAt == null)).Should().BeNull();
    }

    [Fact]
    public void Validator_RejectsPermInBothAllowAndDeny()
    {
        var shared = Guid.NewGuid();
        var validator = new UpdateUserAdminCommandValidator();
        var result = validator.Validate(
            new UpdateUserAdminCommand(Guid.NewGuid(), "Staff", Guid.NewGuid(), [shared], DeniedPermissionIds: [shared]));
        result.IsValid.Should().BeFalse();
    }
}
