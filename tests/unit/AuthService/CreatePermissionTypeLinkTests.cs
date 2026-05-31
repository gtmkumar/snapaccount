using AuthService.Application.PermissionCatalog.Commands.CreatePermission;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for gap #3 auto-linking: creating a permission links it to the
/// resource/action type catalogs, creating new catalog entries on first use and
/// reusing existing ones.
/// </summary>
[Trait("Category", "Unit")]
public sealed class CreatePermissionTypeLinkTests : IDisposable
{
    private readonly AuthDbContext _db;

    public CreatePermissionTypeLinkTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task NewResourceAndAction_CreateCatalogEntries_AndLinkPermission()
    {
        var handler = new CreatePermissionCommandHandler(_db);

        var result = await handler.Handle(
            new CreatePermissionCommand("widget.view", "View widgets"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var rt = await _db.ResourceTypes.SingleAsync(r => r.Key == "widget");
        var at = await _db.ActionTypes.SingleAsync(a => a.Key == "view");
        rt.Name.Should().Be("Widget");          // humanized default
        var perm = await _db.Permissions.SingleAsync(p => p.Name == "widget.view");
        perm.ResourceTypeId.Should().Be(rt.Id);
        perm.ActionTypeId.Should().Be(at.Id);
    }

    [Fact]
    public async Task ExistingResource_IsReused_NotDuplicated()
    {
        var handler = new CreatePermissionCommandHandler(_db);

        await handler.Handle(new CreatePermissionCommand("widget.view", "View"), CancellationToken.None);
        await handler.Handle(new CreatePermissionCommand("widget.edit", "Edit"), CancellationToken.None);

        // One "widget" resource type shared by both permissions; two action types.
        (await _db.ResourceTypes.CountAsync(r => r.Key == "widget")).Should().Be(1);
        (await _db.ActionTypes.CountAsync()).Should().Be(2); // view + edit

        var rtId = (await _db.ResourceTypes.SingleAsync(r => r.Key == "widget")).Id;
        var perms = await _db.Permissions.Where(p => p.Resource == "widget").ToListAsync();
        perms.Should().HaveCount(2);
        perms.Should().OnlyContain(p => p.ResourceTypeId == rtId);
    }

    [Fact]
    public async Task MultiSegmentAction_IsHumanized()
    {
        var handler = new CreatePermissionCommandHandler(_db);
        await handler.Handle(new CreatePermissionCommand("gst.returns.file", "File"), CancellationToken.None);

        var at = await _db.ActionTypes.SingleAsync(a => a.Key == "returns.file");
        at.Name.Should().Be("Returns File");
    }
}
