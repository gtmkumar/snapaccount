using Microsoft.EntityFrameworkCore;

namespace SnapAccount.Shared.Application.Models;

/// <summary>
/// Generic paginated list following the Jason Taylor CleanArchitecture pattern.
/// Used by all SnapAccount query handlers that return paged results.
/// </summary>
public sealed class PaginatedList<T> where T : class
{
    /// <summary>The items on the current page.</summary>
    public IReadOnlyCollection<T> Items { get; }

    /// <summary>1-based current page number.</summary>
    public int PageNumber { get; }

    /// <summary>Total number of pages.</summary>
    public int TotalPages { get; }

    /// <summary>Total count of all matching items across all pages.</summary>
    public int TotalCount { get; }

    /// <summary>Returns true when a previous page exists.</summary>
    public bool HasPreviousPage => PageNumber > 1;

    /// <summary>Returns true when a next page exists.</summary>
    public bool HasNextPage => PageNumber < TotalPages;

    private PaginatedList(IReadOnlyCollection<T> items, int count, int pageNumber, int pageSize)
    {
        PageNumber = pageNumber;
        TotalPages = (int)Math.Ceiling(count / (double)pageSize);
        TotalCount = count;
        Items = items;
    }

    /// <summary>
    /// Creates a <see cref="PaginatedList{T}"/> by executing COUNT and SELECT with
    /// Skip/Take against the provided <paramref name="source"/> queryable.
    /// Always applies <c>AsNoTracking()</c> — paginated queries are read-only.
    /// </summary>
    public static async Task<PaginatedList<T>> CreateAsync(
        IQueryable<T> source,
        int pageNumber,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var count = await source.CountAsync(cancellationToken);
        var items = await source
            .AsNoTracking()
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PaginatedList<T>(items, count, pageNumber, pageSize);
    }
}
