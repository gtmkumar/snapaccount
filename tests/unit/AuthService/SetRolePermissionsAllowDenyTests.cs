using AuthService.Application.Roles.Commands.SetRolePermissions;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for tri-state role permissions (gap #2 authoring). Verifies allow +
/// deny rows are persisted with the right flag, that re-saving flips an existing
/// row's allow/deny state, and that omitted permissions are removed.
/// Runs as SUPER_ADMIN ("*") so the org-context + delegation guards are bypassed.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SetRolePermissionsAllowDenyTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Guid _orgId = Guid.NewGuid();

    public SetRolePermissionsAllowDenyTests()
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
        m.SetupGet(x => x.OrganizationId).Returns(Guid.NewGuid());
        m.SetupGet(x => x.IsAuthenticated).Returns(true);
        m.SetupGet(x => x.Permissions).Returns(new[] { "*" });
        m.Setup(x => x.HasPermission(It.IsAny<string>())).Returns(true);
        return m.Object;
    }

    private async Task<(Role role, Permission p1, Permission p2)> Seed()
    {
        var role = Role.CreateOrgRole(_orgId, Guid.NewGuid(), "custom_role", "Custom");
        var p1 = Permission.Create("document.read", "document", "read");
        var p2 = Permission.Create("document.delete", "document", "delete");
        _db.Roles.Add(role);
        _db.Permissions.AddRange(p1, p2);
        await _db.SaveChangesAsync();
        return (role, p1, p2);
    }

    private async Task<RolePermission?> Row(Guid roleId, Guid permId) =>
        await _db.RolePermissions.FirstOrDefaultAsync(rp =>
            rp.RoleId == roleId && rp.PermissionId == permId && rp.DeletedAt == null);

    [Fact]
    public async Task PersistsAllowAndDenyRows()
    {
        var (role, p1, p2) = await Seed();
        var handler = new SetRolePermissionsCommandHandler(_db, SuperAdmin());

        var result = await handler.Handle(
            new SetRolePermissionsCommand(role.Id, [p1.Id], [p2.Id]), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await Row(role.Id, p1.Id))!.IsAllowed.Should().BeTrue();
        (await Row(role.Id, p2.Id))!.IsAllowed.Should().BeFalse();
    }

    [Fact]
    public async Task ReSave_FlipsAllowToDeny_AndRemovesOmitted()
    {
        var (role, p1, p2) = await Seed();
        var handler = new SetRolePermissionsCommandHandler(_db, SuperAdmin());

        // First: p1 allow, p2 allow.
        await handler.Handle(new SetRolePermissionsCommand(role.Id, [p1.Id, p2.Id], []), CancellationToken.None);
        (await Row(role.Id, p1.Id))!.IsAllowed.Should().BeTrue();

        // Then: p1 flips to deny, p2 omitted entirely (removed).
        var result = await handler.Handle(
            new SetRolePermissionsCommand(role.Id, [], [p1.Id]), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await Row(role.Id, p1.Id))!.IsAllowed.Should().BeFalse();
        (await Row(role.Id, p2.Id)).Should().BeNull(); // soft-deleted
    }

    [Fact]
    public void Validator_RejectsPermissionInBothAllowAndDeny()
    {
        var shared = Guid.NewGuid();
        var validator = new SetRolePermissionsCommandValidator();

        var result = validator.Validate(
            new SetRolePermissionsCommand(Guid.NewGuid(), [shared], [shared]));

        result.IsValid.Should().BeFalse();
    }
}
