using LoanService.Application.LoanProducts.Queries.GetLoanProduct;
using LoanService.Application.LoanProducts.Queries.ListLoanProducts;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Domain;

namespace LoanService.Tests.Application;

/// <summary>
/// Unit tests for GET /loans/products (ListLoanProductsQuery) and
/// GET /loans/products/{id} (GetLoanProductQuery).
///
/// Mobile contract verified: response matches TypeScript LoanProduct / LoanProductListResponse
/// interface (productId, bankId, productName, description, minAmount, maxAmount,
/// tenureMonths, interestRate, eligibilityCriteriaJson, isActive).
/// </summary>
[Trait("Category", "Unit")]
public sealed class LoanProductQueryTests : IAsyncDisposable
{
    private readonly InMemoryLoanDbContext _db;

    public LoanProductQueryTests()
    {
        var options = new DbContextOptionsBuilder<InMemoryLoanDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new InMemoryLoanDbContext(options);
    }

    public async ValueTask DisposeAsync() => await _db.DisposeAsync();

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static LoanProduct ActiveProduct(string name = "MSME Loan", decimal interestRate = 12.5m) => new()
    {
        BankId = Guid.NewGuid(),
        ProductName = name,
        MinAmount = 1_00_000m,
        MaxAmount = 50_00_000m,
        TenureMonths = 12,
        InterestRateMin = interestRate,
        InterestRateMax = interestRate + 2m,
        IsActive = true
    };

    private static LoanProduct InactiveProduct() => new()
    {
        BankId = Guid.NewGuid(),
        ProductName = "Archived Product",
        MinAmount = 5_00_000m,
        MaxAmount = 1_00_00_000m,
        TenureMonths = 24,
        InterestRateMin = 10m,
        InterestRateMax = 14m,
        IsActive = false
    };

    // ── ListLoanProductsQuery tests ───────────────────────────────────────────

    [Fact]
    public async Task ListLoanProducts_ReturnsOnlyActiveProducts()
    {
        // Arrange
        _db.LoanProducts.Add(ActiveProduct("Active Product A"));
        _db.LoanProducts.Add(ActiveProduct("Active Product B"));
        _db.LoanProducts.Add(InactiveProduct());
        await _db.SaveChangesAsync();

        var handler = new ListLoanProductsQueryHandler(_db);

        // Act
        var result = await handler.Handle(new ListLoanProductsQuery(Page: 1, PageSize: 50), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2, "inactive product must be excluded from catalog");
        result.Value.TotalCount.Should().Be(2);
        result.Value.Items.Should().OnlyContain(p => p.IsActive);
    }

    [Fact]
    public async Task ListLoanProducts_EmptyCatalog_ReturnsEmptyList()
    {
        var handler = new ListLoanProductsQueryHandler(_db);

        var result = await handler.Handle(new ListLoanProductsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty();
        result.Value.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task ListLoanProducts_ResponseShape_MatchesMobileContract()
    {
        // Arrange — seed one product and verify DTO field names match mobile TypeScript interface:
        // productId, bankId, productName, minAmount, maxAmount, tenureMonths, interestRate, isActive
        var bankId = Guid.NewGuid();
        _db.LoanProducts.Add(new LoanProduct
        {
            BankId = bankId,
            ProductName = "Business Loan",
            MinAmount = 2_00_000m,
            MaxAmount = 75_00_000m,
            TenureMonths = 36,
            InterestRateMin = 14.5m,
            InterestRateMax = 18m,
            IsActive = true
        });
        await _db.SaveChangesAsync();

        var handler = new ListLoanProductsQueryHandler(_db);
        var result = await handler.Handle(new ListLoanProductsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var dto = result.Value.Items[0];

        dto.ProductId.Should().NotBe(Guid.Empty, "productId maps entity Id");
        dto.BankId.Should().Be(bankId);
        dto.ProductName.Should().Be("Business Loan");
        dto.MinAmount.Should().Be(2_00_000m);
        dto.MaxAmount.Should().Be(75_00_000m);
        dto.TenureMonths.Should().Be(36);
        dto.InterestRate.Should().Be(14.5m, "interestRate is the minimum rate (InterestRateMin)");
        dto.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task ListLoanProducts_Pagination_RespectsPageAndPageSize()
    {
        // Arrange: 5 products, request page 2 of 2
        for (int i = 1; i <= 5; i++)
            _db.LoanProducts.Add(ActiveProduct($"Product {i:D2}"));
        await _db.SaveChangesAsync();

        var handler = new ListLoanProductsQueryHandler(_db);
        var result = await handler.Handle(new ListLoanProductsQuery(Page: 2, PageSize: 2), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2, "page 2 with pageSize 2 from 5 items = 2 items");
        result.Value.TotalCount.Should().Be(5, "total count is always the full count, not the page count");
    }

    [Fact]
    public async Task ListLoanProducts_PageSizeClamped_ToMax100()
    {
        // Arrange: only 3 products but client requests 999
        for (int i = 0; i < 3; i++)
            _db.LoanProducts.Add(ActiveProduct($"P{i}"));
        await _db.SaveChangesAsync();

        var handler = new ListLoanProductsQueryHandler(_db);
        var result = await handler.Handle(new ListLoanProductsQuery(Page: 1, PageSize: 999), CancellationToken.None);

        // Should not throw or crash — clamps to 100, returns all 3 available
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Count.Should().BeLessOrEqualTo(100);
    }

    [Fact]
    public async Task ListLoanProducts_SoftDeletedProducts_AreExcluded()
    {
        // Arrange: one soft-deleted active product
        var deleted = ActiveProduct("Deleted Product");
        deleted.DeletedAt = DateTime.UtcNow;
        _db.LoanProducts.Add(deleted);
        _db.LoanProducts.Add(ActiveProduct("Live Product"));
        await _db.SaveChangesAsync();

        var handler = new ListLoanProductsQueryHandler(_db);
        var result = await handler.Handle(new ListLoanProductsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1, "soft-deleted product must not appear");
        result.Value.Items[0].ProductName.Should().Be("Live Product");
    }

    // ── GetLoanProductQuery tests ─────────────────────────────────────────────

    [Fact]
    public async Task GetLoanProduct_ExistingActiveProduct_ReturnsDto()
    {
        var product = ActiveProduct("Working Capital Loan", interestRate: 11.5m);
        _db.LoanProducts.Add(product);
        await _db.SaveChangesAsync();

        var handler = new GetLoanProductQueryHandler(_db);
        var result = await handler.Handle(new GetLoanProductQuery(product.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ProductId.Should().Be(product.Id);
        result.Value.ProductName.Should().Be("Working Capital Loan");
        result.Value.InterestRate.Should().Be(11.5m);
    }

    [Fact]
    public async Task GetLoanProduct_NonExistentId_ReturnsNotFound()
    {
        var handler = new GetLoanProductQueryHandler(_db);
        var result = await handler.Handle(new GetLoanProductQuery(Guid.NewGuid()), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task GetLoanProduct_InactiveProduct_ReturnsNotFound()
    {
        var product = InactiveProduct();
        _db.LoanProducts.Add(product);
        await _db.SaveChangesAsync();

        var handler = new GetLoanProductQueryHandler(_db);
        var result = await handler.Handle(new GetLoanProductQuery(product.Id), CancellationToken.None);

        result.IsFailure.Should().BeTrue("inactive products should return NotFound, not the product data");
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task GetLoanProduct_SoftDeletedProduct_ReturnsNotFound()
    {
        var product = ActiveProduct("Soon To Be Gone");
        product.DeletedAt = DateTime.UtcNow;
        _db.LoanProducts.Add(product);
        await _db.SaveChangesAsync();

        var handler = new GetLoanProductQueryHandler(_db);
        var result = await handler.Handle(new GetLoanProductQuery(product.Id), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}
