using AuthService.Application.Navigation.Commands.CreateNavigationItem;
using AuthService.Application.Navigation.Commands.DeleteNavigationItem;
using AuthService.Application.Navigation.Commands.UpdateNavigationItem;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for Menu Management CRUD over the navigation catalog.
/// </summary>
[Trait("Category", "Unit")]
public sealed class NavigationManagementTests : IDisposable
{
    private readonly AuthDbContext _db;

    public NavigationManagementTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Create_AddsItemWithPermissionMappings()
    {
        var p1 = Guid.NewGuid();
        var handler = new CreateNavigationItemCommandHandler(_db);

        var result = await handler.Handle(
            new CreateNavigationItemCommand("reports.adv", "Adv Reports", "/reports/adv", "BarChart3", 50, null, [p1]),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var item = await _db.NavigationItems.SingleAsync(n => n.Key == "reports.adv");
        item.Label.Should().Be("Adv Reports");
        (await _db.MenuPermissions.CountAsync(mp => mp.MenuId == item.Id && mp.DeletedAt == null)).Should().Be(1);
    }

    [Fact]
    public async Task Create_DuplicateKey_Conflicts()
    {
        var handler = new CreateNavigationItemCommandHandler(_db);
        await handler.Handle(new CreateNavigationItemCommand("dup", "A", "/a", null, 1, null, null), CancellationToken.None);

        var result = await handler.Handle(new CreateNavigationItemCommand("dup", "B", "/b", null, 2, null, null), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("Navigation.Duplicate");
    }

    [Fact]
    public async Task Update_EditsFields_AndReconcilesPermissions()
    {
        var pKeep = Guid.NewGuid();
        var pOld = Guid.NewGuid();
        var pNew = Guid.NewGuid();
        var create = new CreateNavigationItemCommandHandler(_db);
        await create.Handle(new CreateNavigationItemCommand("x", "X", "/x", null, 1, null, [pKeep, pOld]), CancellationToken.None);
        var item = await _db.NavigationItems.SingleAsync(n => n.Key == "x");

        var update = new UpdateNavigationItemCommandHandler(_db);
        var result = await update.Handle(
            new UpdateNavigationItemCommand(item.Id, "X renamed", "/x2", "Globe", 9, null, false, [pKeep, pNew]),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var reloaded = await _db.NavigationItems.SingleAsync(n => n.Id == item.Id);
        reloaded.Label.Should().Be("X renamed");
        reloaded.Url.Should().Be("/x2");
        reloaded.IsActive.Should().BeFalse();

        var activePerms = await _db.MenuPermissions
            .Where(mp => mp.MenuId == item.Id && mp.DeletedAt == null)
            .Select(mp => mp.PermissionId).ToListAsync();
        activePerms.Should().BeEquivalentTo([pKeep, pNew]); // pOld removed, pNew added
    }

    [Fact]
    public async Task Delete_SoftDeletes_AndPromotesChildrenToTopLevel()
    {
        var create = new CreateNavigationItemCommandHandler(_db);
        await create.Handle(new CreateNavigationItemCommand("parent", "Parent", "/p", null, 1, null, null), CancellationToken.None);
        var parent = await _db.NavigationItems.SingleAsync(n => n.Key == "parent");
        await create.Handle(new CreateNavigationItemCommand("child", "Child", "/c", null, 2, parent.Id, null), CancellationToken.None);

        var del = new DeleteNavigationItemCommandHandler(_db);
        var result = await del.Handle(new DeleteNavigationItemCommand(parent.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await _db.NavigationItems.FirstOrDefaultAsync(n => n.Key == "parent" && n.DeletedAt == null)).Should().BeNull();
        var child = await _db.NavigationItems.SingleAsync(n => n.Key == "child");
        child.ParentId.Should().BeNull(); // promoted
    }
}
