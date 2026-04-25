using SnapAccount.Shared.Application.Models;

namespace SnapAccount.Shared.Application.Mappings;

/// <summary>
/// Extension methods for projecting queryables into paginated lists.
/// Mirrors the Jason Taylor CleanArchitecture MappingExtensions pattern.
/// Query handlers use these to project directly from <c>IXxxDbContext</c> without
/// loading full entities into memory.
/// </summary>
public static class MappingExtensions
{
    /// <summary>
    /// Projects a typed queryable into a <see cref="PaginatedList{T}"/> asynchronously.
    /// Applies <c>AsNoTracking()</c> automatically — always use for read-only queries.
    /// </summary>
    /// <typeparam name="T">The DTO or projected type. Must be a class.</typeparam>
    /// <param name="queryable">The EF Core queryable source (already filtered/ordered).</param>
    /// <param name="pageNumber">1-based page number.</param>
    /// <param name="pageSize">Number of items per page.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public static Task<PaginatedList<T>> PaginatedListAsync<T>(
        this IQueryable<T> queryable,
        int pageNumber,
        int pageSize,
        CancellationToken cancellationToken = default)
        where T : class
        => PaginatedList<T>.CreateAsync(queryable, pageNumber, pageSize, cancellationToken);
}
