using AuthService.Application.Navigation.Queries.GetMyMenu;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the backend-driven navigation menu query (gap #1). Verifies
/// permission filtering, the unmapped=public rule, the "*" wildcard, ordering,
/// and parent/child tree assembly.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GetMyMenuQueryTests : IDisposable
{
    private readonly AuthDbContext _db;
    private readonly Guid _userId = Guid.NewGuid();

    public GetMyMenuQueryTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private Mock<ICurrentUser> CurrentUser()
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(_userId);
        m.SetupGet(x => x.OrganizationId).Returns((Guid?)null);
        return m;
    }

    private async Task<Permission> SeedPermission(string name)
    {
        var p = Permission.Create(name, "menu", name);
        _db.Permissions.Add(p);
        await _db.SaveChangesAsync();
        return p;
    }

    private async Task<NavigationItem> SeedItem(string key, string label, int order, Guid? parentId = null)
    {
        var n = NavigationItem.Create(key, label, "/" + key, "Circle", order, parentId);
        _db.NavigationItems.Add(n);
        await _db.SaveChangesAsync();
        return n;
    }

    private async Task Map(Guid menuId, Guid permId)
    {
        _db.MenuPermissions.Add(MenuPermission.Create(menuId, permId));
        await _db.SaveChangesAsync();
    }

    /// <summary>Gives the test user a role holding exactly <paramref name="permIds"/>.</summary>
    private async Task GrantViaRole(params Guid[] permIds)
    {
        var role = Role.Create($"ROLE_{Guid.NewGuid():N}", "Role", isSystemRole: true);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync();
        foreach (var pid in permIds) _db.RolePermissions.Add(RolePermission.Create(role.Id, pid));
        _db.UserRoles.Add(UserRole.Create(_userId, role.Id));
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task ReturnsPublicItems_AndOnlyPermittedMappedItems_InOrder()
    {
        var gstPerm = await SeedPermission("menu.gst.view");
        await SeedPermission("menu.team.view");

        var dashboard = await SeedItem("dashboard", "Dashboard", 10); // unmapped → public
        var gst = await SeedItem("gst", "GST", 30);
        var team = await SeedItem("team", "Team", 110);
        await Map(gst.Id, gstPerm.Id);
        await Map(team.Id, (await _db.Permissions.FirstAsync(p => p.Name == "menu.team.view")).Id);

        await GrantViaRole(gstPerm.Id); // user can see GST but not Team

        var handler = new GetMyMenuQueryHandler(_db, CurrentUser().Object);
        var result = await handler.Handle(new GetMyMenuQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Select(n => n.Key).Should().Equal("dashboard", "gst"); // ordered, team excluded
    }

    [Fact]
    public async Task WildcardUser_SeesEveryItem()
    {
        var star = await SeedPermission("*");
        var gstPerm = await SeedPermission("menu.gst.view");
        var dashboard = await SeedItem("dashboard", "Dashboard", 10);
        var gst = await SeedItem("gst", "GST", 30);
        await Map(gst.Id, gstPerm.Id);
        await GrantViaRole(star.Id);

        var handler = new GetMyMenuQueryHandler(_db, CurrentUser().Object);
        var result = await handler.Handle(new GetMyMenuQuery(), CancellationToken.None);

        result.Value.Select(n => n.Key).Should().Equal("dashboard", "gst");
    }

    [Fact]
    public async Task UserWithoutPerms_SeesOnlyPublicItems()
    {
        var gstPerm = await SeedPermission("menu.gst.view");
        await SeedItem("dashboard", "Dashboard", 10);
        var gst = await SeedItem("gst", "GST", 30);
        await Map(gst.Id, gstPerm.Id);
        // no role granted

        var handler = new GetMyMenuQueryHandler(_db, CurrentUser().Object);
        var result = await handler.Handle(new GetMyMenuQuery(), CancellationToken.None);

        result.Value.Select(n => n.Key).Should().Equal("dashboard");
    }

    [Fact]
    public async Task AssemblesParentChildTree()
    {
        var perm = await SeedPermission("menu.loans.view");
        var loans = await SeedItem("loans", "Loans", 60);
        var child = await SeedItem("loans.partner_banks", "Partner Banks", 80, parentId: loans.Id);
        await Map(loans.Id, perm.Id);
        await Map(child.Id, perm.Id);
        await GrantViaRole(perm.Id);

        var handler = new GetMyMenuQueryHandler(_db, CurrentUser().Object);
        var result = await handler.Handle(new GetMyMenuQuery(), CancellationToken.None);

        result.Value.Should().ContainSingle(n => n.Key == "loans");
        var loansNode = result.Value.Single(n => n.Key == "loans");
        loansNode.Children.Should().ContainSingle(c => c.Key == "loans.partner_banks");
    }
}
