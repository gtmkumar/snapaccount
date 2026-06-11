// Shared test infrastructure for DocumentService unit tests.
// These helpers are intentionally NOT file-scoped so they can be used
// across all test files in this project.

using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;

namespace DocumentService.Tests;

// ────────────────────────────────────────────────────────────────────────────
// ICurrentUser fake factory
// ────────────────────────────────────────────────────────────────────────────

internal static class FakeCurrentUser
{
    public static ICurrentUser Make(Guid? orgId = null, Guid? userId = null)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        mock.Setup(u => u.UserId).Returns(userId ?? Guid.NewGuid());
        mock.Setup(u => u.OrganizationId).Returns(orgId ?? Guid.NewGuid());
        mock.Setup(u => u.HasPermission(It.IsAny<string>())).Returns(true);
        mock.Setup(u => u.Permissions).Returns(["document.review", "document.write", "document.archive", "document.admin"]);
        mock.Setup(u => u.Roles).Returns([]);
        return mock.Object;
    }

    public static ICurrentUser Unauthenticated()
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(false);
        mock.Setup(u => u.OrganizationId).Returns((Guid?)null);
        return mock.Object;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Async DbSet mock extensions
// ────────────────────────────────────────────────────────────────────────────

internal static class MockDbSetExtensions
{
    /// <summary>
    /// Builds a Moq <see cref="DbSet{T}"/> from a list.
    /// Supports LINQ + async operations (FirstOrDefaultAsync, AnyAsync, etc.) via
    /// <c>InMemoryAsyncEnumerable</c> — does NOT require reflection over IQueryProvider.Execute.
    /// </summary>
    public static DbSet<T> BuildAsyncDbSetMock<T>(this List<T> source) where T : class
    {
        var queryable = source.AsQueryable();
        var mock = new Mock<DbSet<T>>();

        mock.As<IAsyncEnumerable<T>>()
            .Setup(m => m.GetAsyncEnumerator(It.IsAny<CancellationToken>()))
            .Returns(new InMemoryAsyncEnumerator<T>(source.GetEnumerator()));

        mock.As<IQueryable<T>>()
            .Setup(m => m.Provider)
            .Returns(new InMemoryAsyncQueryProvider<T>(queryable.Provider));

        mock.As<IQueryable<T>>().Setup(m => m.Expression).Returns(queryable.Expression);
        mock.As<IQueryable<T>>().Setup(m => m.ElementType).Returns(queryable.ElementType);
        mock.As<IQueryable<T>>().Setup(m => m.GetEnumerator()).Returns(queryable.GetEnumerator());

        return mock.Object;
    }
}

/// <summary>
/// Wraps a synchronous IQueryProvider so EF Core's async overloads work.
/// Handles both reference types and value types (e.g. bool for AnyAsync).
/// </summary>
internal sealed class InMemoryAsyncQueryProvider<T>(IQueryProvider inner)
    : Microsoft.EntityFrameworkCore.Query.IAsyncQueryProvider
{
    public IQueryable CreateQuery(System.Linq.Expressions.Expression expression)
        => inner.CreateQuery(expression);

    public IQueryable<TElement> CreateQuery<TElement>(System.Linq.Expressions.Expression expression)
        => new InMemoryAsyncQueryable<TElement>(inner.CreateQuery<TElement>(expression));

    public object? Execute(System.Linq.Expressions.Expression expression)
        => inner.Execute(expression);

    public TResult Execute<TResult>(System.Linq.Expressions.Expression expression)
        => inner.Execute<TResult>(expression);

    public TResult ExecuteAsync<TResult>(
        System.Linq.Expressions.Expression expression,
        CancellationToken cancellationToken = default)
    {
        // TResult is Task<TSyncResult>. Extract the inner type and call Execute<TSyncResult>.
        var resultType = typeof(TResult);
        var syncType   = resultType.IsGenericType
            ? resultType.GetGenericArguments()[0]
            : typeof(object);

        // Execute synchronously using the inner provider.
        var executeMethod = typeof(IQueryProvider)
            .GetMethod(nameof(IQueryProvider.Execute), 1, [typeof(System.Linq.Expressions.Expression)])!
            .MakeGenericMethod(syncType);

        var syncResult = executeMethod.Invoke(inner, [expression]);

        // Wrap in Task<TSyncResult> via Task.FromResult<TSyncResult>(syncResult).
        var fromResultMethod = typeof(Task)
            .GetMethod(nameof(Task.FromResult))!
            .MakeGenericMethod(syncType);

        var task = fromResultMethod.Invoke(null, [syncResult])!;
        return (TResult)task;
    }
}

/// <summary>
/// Wraps a synchronous IQueryable{T} and exposes IAsyncEnumerable{T} so that
/// EF Core's ToListAsync / AnyAsync work correctly on projected queries (after .Select()).
/// Also implements IOrderedQueryable{T} so OrderBy/OrderByDescending work.
/// </summary>
internal sealed class InMemoryAsyncQueryable<T>(IQueryable<T> inner)
    : IOrderedQueryable<T>, IAsyncEnumerable<T>
{
    public Type ElementType => inner.ElementType;
    public System.Linq.Expressions.Expression Expression => inner.Expression;
    public IQueryProvider Provider => new InMemoryAsyncQueryProvider<T>(inner.Provider);
    public IEnumerator<T> GetEnumerator() => inner.GetEnumerator();
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => inner.GetEnumerator();
    public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default)
        => new InMemoryAsyncEnumerator<T>(inner.GetEnumerator());
}

/// <summary>Async enumerator backed by a synchronous IEnumerator{T}.</summary>
internal sealed class InMemoryAsyncEnumerator<T>(IEnumerator<T> inner) : IAsyncEnumerator<T>
{
    public T Current => inner.Current;
    public ValueTask<bool> MoveNextAsync() => ValueTask.FromResult(inner.MoveNext());
    public ValueTask DisposeAsync() { inner.Dispose(); return ValueTask.CompletedTask; }
}
