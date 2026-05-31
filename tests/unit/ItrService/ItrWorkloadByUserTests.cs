using FluentAssertions;
using ItrService.Application.Dashboard.Queries.GetWorkloadByUser;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ItrService.Tests;

/// <summary>
/// Unit tests for the per-assignee ITR grievance workload query (Team workload
/// grid, Screen 89). "Assigned" = OPEN/IN_PROGRESS with an assignee;
/// "Completed" = RESOLVED/CLOSED. Unassigned grievances are excluded.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ItrWorkloadByUserTests : IDisposable
{
    private readonly ItrServiceDbContext _db;

    public ItrWorkloadByUserTests()
    {
        var opts = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ItrServiceDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private static Grievance NewGrievance()
        => Grievance.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            "Refund delay", "My refund is late", "REFUND");

    [Fact]
    public async Task GroupsByAssignee_CountingOpenVsResolved()
    {
        var staff1 = Guid.NewGuid();
        var staff2 = Guid.NewGuid();

        // staff1: one in-progress + one resolved → assigned=1, completed=1
        var g1 = NewGrievance(); g1.Assign(staff1);
        var g2 = NewGrievance(); g2.Assign(staff1); g2.Resolve("Fixed");
        // staff2: one in-progress → assigned=1, completed=0
        var g3 = NewGrievance(); g3.Assign(staff2);
        // unassigned → excluded
        var g4 = NewGrievance();

        _db.Grievances.AddRange(g1, g2, g3, g4);
        await _db.SaveChangesAsync();

        var handler = new GetWorkloadByUserQueryHandler(_db);
        var result = await handler.Handle(new GetWorkloadByUserQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);

        var r1 = result.Value.Single(x => x.UserId == staff1);
        r1.Assigned.Should().Be(1);
        r1.Completed.Should().Be(1);

        var r2 = result.Value.Single(x => x.UserId == staff2);
        r2.Assigned.Should().Be(1);
        r2.Completed.Should().Be(0);
    }

    [Fact]
    public async Task ClosedGrievance_CountsAsCompleted()
    {
        var staff = Guid.NewGuid();
        var g = NewGrievance(); g.Assign(staff); g.Close();
        _db.Grievances.Add(g);
        await _db.SaveChangesAsync();

        var handler = new GetWorkloadByUserQueryHandler(_db);
        var result = await handler.Handle(new GetWorkloadByUserQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var row = result.Value.Single(x => x.UserId == staff);
        row.Assigned.Should().Be(0);
        row.Completed.Should().Be(1);
    }
}
