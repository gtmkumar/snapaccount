namespace SnapAccount.Shared.Application;

public abstract record PaginatedQuery : IQuery<object>
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public int Skip => (Page - 1) * PageSize;
}

public record PaginatedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasNextPage => Page < TotalPages;
    public bool HasPreviousPage => Page > 1;

    public static PaginatedResult<T> Create(IReadOnlyList<T> items, int totalCount, int page, int pageSize)
        => new() { Items = items, TotalCount = totalCount, Page = page, PageSize = pageSize };
}
