using LoanService.Application.Common.Interfaces;
using LoanService.Application.LoanProducts.Queries.ListLoanProducts;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanProducts.Queries.GetLoanProduct;

/// <summary>
/// Returns a single loan product by its ID.
/// Consumers: mobile <c>getLoanProduct(productId)</c> (GET /loans/products/{id}).
/// </summary>
/// <param name="ProductId">The product ID to retrieve.</param>
[RequiresPermission("loan.products.read")]
public record GetLoanProductQuery(Guid ProductId) : IQuery<LoanProductDto>;

/// <summary>Handler: returns a single active loan product or NotFound.</summary>
public sealed class GetLoanProductQueryHandler(ILoanServiceDbContext db)
    : IQueryHandler<GetLoanProductQuery, LoanProductDto>
{
    /// <inheritdoc />
    public async Task<Result<LoanProductDto>> Handle(
        GetLoanProductQuery request,
        CancellationToken cancellationToken)
    {
        var entity = await db.LoanProducts
            .Where(p => p.Id == request.ProductId && p.IsActive && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (entity is null)
            return Result<LoanProductDto>.Failure(
                Error.NotFound("LoanProduct.NotFound", $"Loan product '{request.ProductId}' not found."));

        var dto = new LoanProductDto(
            entity.Id,
            entity.BankId,
            entity.ProductName,
            Description: null, // shadow property — available via EF.Property in real DB; excluded for now
            entity.MinAmount,
            entity.MaxAmount,
            entity.TenureMonths,
            entity.InterestRateMin,
            EligibilityCriteriaJson: null, // JsonDocument excluded from API response
            entity.IsActive);

        return Result<LoanProductDto>.Success(dto);
    }
}
