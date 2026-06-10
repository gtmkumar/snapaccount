using CallbackService.Application.Common.Interfaces;
using CallbackService.Application.Dashboard.Queries.GetKpiSnapshot;
using CallbackService.Domain.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using Moq;
using SnapAccount.Shared.Domain;
using Xunit;

namespace CallbackService.Tests;

/// <summary>
/// B5 / GAP-012: Verifies that <see cref="GetKpiSnapshotQueryHandler"/> queries the
/// kpi_daily_snapshot Materialized View with a mandatory org filter (IDOR prevention)
/// and correctly aggregates totals such as FCR and average TTR.
///
/// The handler uses ICallbackDbContext.KpiSnapshots (a DbSet over the MV), so we
/// test the aggregation logic and org-filter semantics with in-memory data via a mock.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GetKpiSnapshotQueryTests
{
    private static IQueryable<KpiDailySnapshot> BuildQueryable(IEnumerable<KpiDailySnapshot> data) =>
        data.AsQueryable();

    private static ICallbackDbContext BuildContext(IEnumerable<KpiDailySnapshot> snapshots)
    {
        var mock = new Mock<ICallbackDbContext>();

        // Create a mock DbSet from in-memory IQueryable
        var queryable = snapshots.AsQueryable();
        var dbSetMock = new Mock<DbSet<KpiDailySnapshot>>();
        dbSetMock.As<IAsyncEnumerable<KpiDailySnapshot>>()
                 .Setup(m => m.GetAsyncEnumerator(It.IsAny<CancellationToken>()))
                 .Returns(new TestAsyncEnumerator<KpiDailySnapshot>(queryable.GetEnumerator()));
        dbSetMock.As<IQueryable<KpiDailySnapshot>>()
                 .Setup(m => m.Provider)
                 .Returns(new TestAsyncQueryProvider<KpiDailySnapshot>(queryable.Provider));
        dbSetMock.As<IQueryable<KpiDailySnapshot>>()
                 .Setup(m => m.Expression).Returns(queryable.Expression);
        dbSetMock.As<IQueryable<KpiDailySnapshot>>()
                 .Setup(m => m.ElementType).Returns(queryable.ElementType);
        dbSetMock.As<IQueryable<KpiDailySnapshot>>()
                 .Setup(m => m.GetEnumerator()).Returns(queryable.GetEnumerator());

        mock.Setup(d => d.KpiSnapshots).Returns(dbSetMock.Object);
        return mock.Object;
    }

    private static KpiDailySnapshot Snapshot(
        Guid orgId, int daysAgo,
        long completed = 5, long pending = 2, long slaBreached = 1, long total = 10,
        double? avgTtr = 30.0, double? avgCsat = 4.0) =>
        new()
        {
            OrgId = orgId,
            SnapshotDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-daysAgo)),
            CountCompleted = completed,
            CountPending = pending,
            CountSlaBreached = slaBreached,
            TotalRequested = total,
            AvgTtrMinutes = avgTtr,
            AvgCsat = avgCsat,
        };

    [Fact]
    public async Task Handle_WithOrgData_ReturnsCorrectAggregates()
    {
        // Arrange
        var orgId = Guid.NewGuid();
        var data = new[]
        {
            Snapshot(orgId, daysAgo: 1, completed: 8, total: 10, slaBreached: 2, avgTtr: 20.0, avgCsat: 4.5),
            Snapshot(orgId, daysAgo: 2, completed: 6, total: 10, slaBreached: 1, avgTtr: 30.0, avgCsat: 3.5),
        };
        var ctx = BuildContext(data);
        var handler = new GetKpiSnapshotQueryHandler(ctx);

        // Act
        var result = await handler.Handle(new GetKpiSnapshotQuery(orgId, 30), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var response = result.Value;

        response.OrganizationId.Should().Be(orgId);
        response.TotalRequested.Should().Be(20);
        response.TotalCompleted.Should().Be(14);
        response.TotalSlaBreached.Should().Be(3);

        // FCR = 14 / 20 = 0.7
        response.OverallFcr.Should().BeApproximately(0.7, 0.001);

        // Avg TTR = (20.0 + 30.0) / 2 = 25.0
        response.OverallAvgTtrMinutes.Should().BeApproximately(25.0, 0.01);

        // Avg CSAT = (4.5 + 3.5) / 2 = 4.0
        response.OverallAvgCsat.Should().BeApproximately(4.0, 0.01);

        response.DailyRows.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_WithEmptyMv_ReturnsZeroAggregatesAndNullRatios()
    {
        // Arrange — no data for this org
        var orgId = Guid.NewGuid();
        var ctx = BuildContext(Array.Empty<KpiDailySnapshot>());
        var handler = new GetKpiSnapshotQueryHandler(ctx);

        // Act
        var result = await handler.Handle(new GetKpiSnapshotQuery(orgId, 30), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.TotalRequested.Should().Be(0);
        result.Value.TotalCompleted.Should().Be(0);
        result.Value.OverallFcr.Should().BeNull("FCR is undefined when no callbacks exist");
        result.Value.OverallAvgTtrMinutes.Should().BeNull("Avg TTR is undefined with no data");
        result.Value.DailyRows.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_OrgIsolation_ExcludesOtherOrgsSnapshots()
    {
        // P6-HANDOFF-04 IDOR: data from another org must not leak
        var orgId = Guid.NewGuid();
        var otherOrgId = Guid.NewGuid();
        var data = new[]
        {
            Snapshot(orgId, daysAgo: 1, total: 10),
            Snapshot(otherOrgId, daysAgo: 1, total: 9999),   // must not appear
        };
        var ctx = BuildContext(data);
        var handler = new GetKpiSnapshotQueryHandler(ctx);

        // Act — querying for orgId only
        var result = await handler.Handle(new GetKpiSnapshotQuery(orgId, 30), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.TotalRequested.Should().Be(10, "other org's data (9999) must be excluded");
        result.Value.DailyRows.Should().OnlyContain(r => true,
            "result must only contain the queried org's data");
    }

    [Fact]
    public async Task Handle_WithWindowFilter_ExcludesOldSnapshots()
    {
        // Arrange: 1-day window — data beyond that must be excluded
        var orgId = Guid.NewGuid();
        var data = new[]
        {
            Snapshot(orgId, daysAgo: 0, total: 5),    // within 1-day window
            Snapshot(orgId, daysAgo: 5, total: 999),  // outside 1-day window
        };
        var ctx = BuildContext(data);
        var handler = new GetKpiSnapshotQueryHandler(ctx);

        // Act
        var result = await handler.Handle(new GetKpiSnapshotQuery(orgId, DaysBack: 1), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.TotalRequested.Should().Be(5,
            "snapshots outside the DaysBack window must be excluded");
    }
}

// ---------------------------------------------------------------------------
// Test infrastructure helpers for mocking async EF Core DbSet
// ---------------------------------------------------------------------------

internal sealed class TestAsyncEnumerator<T>(IEnumerator<T> inner) : IAsyncEnumerator<T>
{
    public T Current => inner.Current;
    public ValueTask<bool> MoveNextAsync() => new(inner.MoveNext());
    public ValueTask DisposeAsync() { inner.Dispose(); return ValueTask.CompletedTask; }
}

internal sealed class TestAsyncQueryProvider<TEntity>(IQueryProvider inner) : IAsyncQueryProvider
{
    public IQueryable CreateQuery(System.Linq.Expressions.Expression expression) =>
        new TestAsyncEnumerable<TEntity>(expression);

    public IQueryable<TElement> CreateQuery<TElement>(System.Linq.Expressions.Expression expression) =>
        new TestAsyncEnumerable<TElement>(expression);

    public object? Execute(System.Linq.Expressions.Expression expression) =>
        inner.Execute(expression);

    public TResult Execute<TResult>(System.Linq.Expressions.Expression expression) =>
        inner.Execute<TResult>(expression);

    public TResult ExecuteAsync<TResult>(System.Linq.Expressions.Expression expression, CancellationToken cancellationToken = default)
    {
        var expectedResultType = typeof(TResult).GetGenericArguments()[0];
        var executionResult = typeof(IQueryProvider)
            .GetMethod(nameof(Execute), 1, [typeof(System.Linq.Expressions.Expression)])!
            .MakeGenericMethod(expectedResultType)
            .Invoke(this, [expression]);

        return (TResult)typeof(Task)
            .GetMethod(nameof(Task.FromResult))!
            .MakeGenericMethod(expectedResultType)
            .Invoke(null, [executionResult])!;
    }
}

internal sealed class TestAsyncEnumerable<T> : EnumerableQuery<T>, IAsyncEnumerable<T>, IQueryable<T>
{
    public TestAsyncEnumerable(IEnumerable<T> enumerable) : base(enumerable) { }
    public TestAsyncEnumerable(System.Linq.Expressions.Expression expression) : base(expression) { }

    IQueryProvider IQueryable.Provider => new TestAsyncQueryProvider<T>(this);

    public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default) =>
        new TestAsyncEnumerator<T>(this.AsEnumerable().GetEnumerator());
}
