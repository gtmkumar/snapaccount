using AuthService.Application.PermissionCatalog.Commands.UpdateActionType;
using AuthService.Application.PermissionCatalog.Commands.UpdateResourceType;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>Unit tests for resource/action type rename + (de)activate (gap #3 mgmt).</summary>
[Trait("Category", "Unit")]
public sealed class UpdateTypeTests : IDisposable
{
    private readonly AuthDbContext _db;

    public UpdateTypeTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task UpdateResourceType_RenamesAndDeactivates_KeyImmutable()
    {
        var rt = ResourceType.Create("gst", "Gst");
        _db.ResourceTypes.Add(rt);
        await _db.SaveChangesAsync();

        var result = await new UpdateResourceTypeCommandHandler(_db)
            .Handle(new UpdateResourceTypeCommand(rt.Id, "GST Filing", "Goods & Services Tax", false), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var reloaded = await _db.ResourceTypes.SingleAsync(r => r.Id == rt.Id);
        reloaded.Name.Should().Be("GST Filing");
        reloaded.IsActive.Should().BeFalse();
        reloaded.Key.Should().Be("gst"); // immutable
    }

    [Fact]
    public async Task UpdateActionType_Renames()
    {
        var at = ActionType.Create("returns.file", "Returns File");
        _db.ActionTypes.Add(at);
        await _db.SaveChangesAsync();

        var result = await new UpdateActionTypeCommandHandler(_db)
            .Handle(new UpdateActionTypeCommand(at.Id, "File Returns", null, true), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        (await _db.ActionTypes.SingleAsync(a => a.Id == at.Id)).Name.Should().Be("File Returns");
    }

    [Fact]
    public async Task UpdateResourceType_NotFound()
    {
        var result = await new UpdateResourceTypeCommandHandler(_db)
            .Handle(new UpdateResourceTypeCommand(Guid.NewGuid(), "X", null, true), CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("ResourceType.NotFound");
    }
}
