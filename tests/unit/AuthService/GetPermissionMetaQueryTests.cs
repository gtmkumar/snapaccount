using AuthService.Application.PermissionCatalog.Queries.GetPermissionMeta;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the ResourceType/ActionType catalog query (gap #3): active-only,
/// ordered by key.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GetPermissionMetaQueryTests : IDisposable
{
    private readonly AuthDbContext _db;

    public GetPermissionMetaQueryTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task ReturnsActiveCatalogs_OrderedByKey()
    {
        _db.ResourceTypes.AddRange(
            ResourceType.Create("gst", "Gst"),
            ResourceType.Create("accounting", "Accounting"));
        var retired = ResourceType.Create("legacy", "Legacy");
        retired.SetActive(false);
        _db.ResourceTypes.Add(retired);

        _db.ActionTypes.AddRange(
            ActionType.Create("returns.file", "Returns File"),
            ActionType.Create("members.read", "Members Read"));
        await _db.SaveChangesAsync();

        var handler = new GetPermissionMetaQueryHandler(_db);
        var result = await handler.Handle(new GetPermissionMetaQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // Active only, ordered by key.
        result.Value.ResourceTypes.Select(r => r.Key).Should().Equal("accounting", "gst");
        result.Value.ActionTypes.Select(a => a.Key).Should().Equal("members.read", "returns.file");
    }

    [Fact]
    public async Task ReturnsEmpty_WhenNoCatalogsSeeded()
    {
        var handler = new GetPermissionMetaQueryHandler(_db);
        var result = await handler.Handle(new GetPermissionMetaQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ResourceTypes.Should().BeEmpty();
        result.Value.ActionTypes.Should().BeEmpty();
    }
}
