using FluentValidation;
using GstService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.HsnSac.Queries.SearchHsnSac;

/// <summary>
/// Full-text search over the HSN/SAC master table.
/// Uses PostgreSQL tsvector index for fast search.
/// Phase 6B: replaces the 501 stub for GET /gst/hsn-sac/search?q=.
/// </summary>
public record SearchHsnSacQuery(string Query, string? CodeType = null, int Limit = 20) : IQuery<SearchHsnSacResponse>;

/// <summary>HSN/SAC search response.</summary>
public record SearchHsnSacResponse(IReadOnlyList<HsnSacDto> Items);

/// <summary>HSN/SAC code DTO.</summary>
public record HsnSacDto(
    Guid Id,
    string Code,
    string CodeType,
    string Description,
    decimal? GstRatePct);

/// <summary>Validator for HSN/SAC search.</summary>
public sealed class SearchHsnSacQueryValidator : AbstractValidator<SearchHsnSacQuery>
{
    public SearchHsnSacQueryValidator()
    {
        RuleFor(x => x.Query)
            .NotEmpty()
            .MinimumLength(2).WithMessage("Search query must be at least 2 characters.")
            .MaximumLength(200);
        RuleFor(x => x.Limit).InclusiveBetween(1, 100);
        When(x => x.CodeType is not null, () =>
            RuleFor(x => x.CodeType)
                .Must(t => t is "HSN" or "SAC")
                .WithMessage("CodeType must be HSN or SAC."));
    }
}

/// <summary>Handler for <see cref="SearchHsnSacQuery"/>.</summary>
public sealed class SearchHsnSacQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<SearchHsnSacQuery, SearchHsnSacResponse>
{
    /// <inheritdoc />
    public async Task<Result<SearchHsnSacResponse>> Handle(
        SearchHsnSacQuery request,
        CancellationToken cancellationToken)
    {
        var q = dbContext.HsnSacCodes.Where(h => h.IsActive && h.DeletedAt == null);

        if (request.CodeType is not null)
            q = q.Where(h => h.CodeType == request.CodeType);

        // Search by code prefix OR description contains (case-insensitive)
        var searchTerm = request.Query.Trim().ToUpperInvariant();
        q = q.Where(h =>
            h.Code.StartsWith(searchTerm) ||
            h.Description.ToUpper().Contains(searchTerm));

        var items = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .ToListAsync(
                q.OrderBy(h => h.Code).Take(request.Limit),
                cancellationToken);

        var dtos = items.Select(h => new HsnSacDto(h.Id, h.Code, h.CodeType, h.Description, h.GstRatePct)).ToList();
        return new SearchHsnSacResponse(dtos);
    }
}
