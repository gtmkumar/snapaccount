using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.ReferenceData.Queries.GetReferenceData;

/// <summary>
/// Returns reference-data entries, optionally filtered by category and active status.
/// No special permission required — any authenticated user may read the catalog
/// (it drives dropdowns across the entire app).
///
/// <paramref name="Category"/> null → all categories.
/// <paramref name="ActiveOnly"/> true (default) → only is_active=true entries (dropdown consumers).
///                              false → active + inactive (management screen).
/// </summary>
public record GetReferenceDataQuery(
    string? Category = null,
    bool ActiveOnly = true) : IQuery<IReadOnlyList<ReferenceDataDto>>;

/// <summary>Read-only DTO for a reference-data entry.</summary>
public record ReferenceDataDto(
    Guid Id,
    string Category,
    string Code,
    string Name,
    string? ParentCode,
    bool IsActive,
    int SortOrder);

public sealed class GetReferenceDataQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetReferenceDataQuery, IReadOnlyList<ReferenceDataDto>>
{
    public async Task<Result<IReadOnlyList<ReferenceDataDto>>> Handle(
        GetReferenceDataQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.ReferenceData
            .Where(r => r.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(request.Category))
            query = query.Where(r => r.Category == request.Category.Trim().ToUpperInvariant());

        if (request.ActiveOnly)
            query = query.Where(r => r.IsActive);

        var items = await query
            .OrderBy(r => r.Category)
            .ThenBy(r => r.SortOrder)
            .ThenBy(r => r.Name)
            .Select(r => new ReferenceDataDto(
                r.Id, r.Category, r.Code, r.Name, r.ParentCode, r.IsActive, r.SortOrder))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<ReferenceDataDto>>.Success(items);
    }
}
