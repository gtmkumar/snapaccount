using FluentAssertions;
using GstService.Application.Dashboard.Queries.GetWorkloadByUser;
using GstService.Domain.Entities;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GstService.Tests;

/// <summary>
/// Unit tests for the per-CA GST notice workload query (Team workload grid, Screen 89).
/// "Assigned" = notice has a CA AND status != CLOSED; "Completed" = status == CLOSED.
/// Unassigned notices are excluded.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstWorkloadByUserTests : IDisposable
{
    private readonly GstDbContext _db;

    public GstWorkloadByUserTests()
    {
        var opts = new DbContextOptionsBuilder<GstDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new GstDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private GstNotice NewNotice(Guid orgId)
        => GstNotice.Create(orgId, $"ASMT-{Guid.NewGuid():N}", "ASMT-10",
            DateOnly.FromDateTime(DateTime.UtcNow), null, "Test notice");

    [Fact]
    public async Task GroupsByAssignedCa_CountingOpenVsClosed()
    {
        var orgId = Guid.NewGuid();
        var ca1 = Guid.NewGuid();
        var ca2 = Guid.NewGuid();

        // CA1: one open + one closed → assigned=1, completed=1
        var n1 = NewNotice(orgId); n1.AssignToCa(ca1);
        var n2 = NewNotice(orgId); n2.AssignToCa(ca1); n2.Close();
        // CA2: one open → assigned=1, completed=0
        var n3 = NewNotice(orgId); n3.AssignToCa(ca2);
        // Unassigned → excluded entirely
        var n4 = NewNotice(orgId);

        _db.GstNotices.AddRange(n1, n2, n3, n4);
        await _db.SaveChangesAsync();

        var handler = new GetWorkloadByUserQueryHandler(_db);
        var result = await handler.Handle(new GetWorkloadByUserQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);

        var r1 = result.Value.Single(x => x.UserId == ca1);
        r1.Assigned.Should().Be(1);
        r1.Completed.Should().Be(1);

        var r2 = result.Value.Single(x => x.UserId == ca2);
        r2.Assigned.Should().Be(1);
        r2.Completed.Should().Be(0);
    }

    [Fact]
    public async Task ReturnsEmpty_WhenNoNoticesAssigned()
    {
        var orgId = Guid.NewGuid();
        _db.GstNotices.Add(NewNotice(orgId));
        await _db.SaveChangesAsync();

        var handler = new GetWorkloadByUserQueryHandler(_db);
        var result = await handler.Handle(new GetWorkloadByUserQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeEmpty();
    }
}
