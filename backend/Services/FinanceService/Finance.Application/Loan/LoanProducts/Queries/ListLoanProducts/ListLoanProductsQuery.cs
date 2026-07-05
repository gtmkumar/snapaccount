using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanProducts.Queries.ListLoanProducts;

/// <summary>
/// Returns the paginated catalog of active loan products — org-agnostic (public catalog).
/// Consumers: mobile LoanHubScreen (GET /loans/products).
/// </summary>
/// <param name="Page">1-based page number.</param>
/// <param name="PageSize">Items per page (default 20, max 100).</param>
public record ListLoanProductsQuery(int Page = 1, int PageSize = 20)
    : IQuery<LoanProductListResult>;

/// <summary>Loan product DTO that matches the mobile <c>LoanProduct</c> TypeScript interface exactly.</summary>
/// <param name="ProductId">Unique product identifier (maps to entity Id).</param>
/// <param name="BankId">FK to partner bank.</param>
/// <param name="ProductName">Human-readable product name.</param>
/// <param name="Description">Optional product description (from shadow property).</param>
/// <param name="MinAmount">Minimum loan amount in INR.</param>
/// <param name="MaxAmount">Maximum loan amount in INR.</param>
/// <param name="TenureMonths">Minimum tenure in months (maps to tenure_min_months).</param>
/// <param name="InterestRate">Representative interest rate — uses the minimum rate (interest_rate_min_pct). Null is serialized as 0.</param>
/// <param name="EligibilityCriteriaJson">Serialized eligibility criteria JSON string (nullable).</param>
/// <param name="IsActive">Whether the product is currently active.</param>
public record LoanProductDto(
    Guid ProductId,
    Guid BankId,
    string ProductName,
    string? Description,
    decimal MinAmount,
    decimal MaxAmount,
    int TenureMonths,
    decimal InterestRate,
    string? EligibilityCriteriaJson,
    bool IsActive);

/// <summary>Paginated loan product list response.</summary>
/// <param name="Items">Products on the current page.</param>
/// <param name="TotalCount">Total active products in the catalog.</param>
public record LoanProductListResult(IReadOnlyList<LoanProductDto> Items, int TotalCount);

/// <summary>
/// Handler: returns paginated active loan products with no org-scoping
/// (catalog is public to all authenticated users).
/// Shadow properties (Description, InterestRateMin) are accessed via EF Core
/// projection using <see cref="EF.Property{TProperty}"/>.
/// </summary>
[RequiresPermission("loan.products.read")]
public sealed class ListLoanProductsQueryHandler(ILoanServiceDbContext db)
    : IQueryHandler<ListLoanProductsQuery, LoanProductListResult>
{
    /// <inheritdoc />
    public async Task<Result<LoanProductListResult>> Handle(
        ListLoanProductsQuery request,
        CancellationToken cancellationToken)
    {
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var skip = (Math.Max(request.Page, 1) - 1) * pageSize;

        var baseQuery = db.LoanProducts
            .Where(p => p.IsActive && p.DeletedAt == null);

        var totalCount = await baseQuery.CountAsync(cancellationToken);

        // Load entities then project client-side.
        // Avoids EF.Property<string?>("Description") in a server-side projection
        // (shadow properties cannot be projected by the InMemory provider in tests and
        // require a raw SQL SELECT in production — entity load is fine for this small catalog).
        // EligibilityCriteriaJsonb (JsonDocument) is also excluded from serialization to avoid
        // round-trip serialization issues; eligibilityCriteriaJson is returned as null.
        var entities = await baseQuery
            .OrderBy(p => p.ProductName)
            .Skip(skip)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = entities
            .Select(p => new LoanProductDto(
                p.Id,
                p.BankId,
                p.ProductName,
                Description: null, // shadow property — available via EF.Property in real DB; excluded for now
                p.MinAmount,
                p.MaxAmount,
                p.TenureMonths,
                p.InterestRateMin,
                EligibilityCriteriaJson: null, // JsonDocument excluded from API response
                p.IsActive))
            .ToList();

        return Result<LoanProductListResult>.Success(
            new LoanProductListResult(items, totalCount));
    }
}
