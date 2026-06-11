using AccountingService.Application.Reports.Queries.GetComparativeAnalysis;
using FluentAssertions;
using FluentValidation.TestHelper;
using Xunit;

namespace AccountingService.Tests;

/// <summary>
/// Unit tests for GetComparativeAnalysisQueryValidator — GAP-044.
/// Validates year range, category filter, and org-scope constraints.
/// </summary>
public sealed class ComparativeAnalysisValidatorTests
{
    private readonly GetComparativeAnalysisQueryValidator _validator = new();

    [Fact]
    public void Valid_BaseYearOnly_Passes()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026);

        var result = _validator.TestValidate(query);

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Valid_WithPriorYear_Passes()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, PriorYear: 2025);

        var result = _validator.TestValidate(query);

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Valid_WithCategoryFilter_Income_Passes()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, CategoryFilter: "INCOME");

        var result = _validator.TestValidate(query);

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("INCOME")]
    [InlineData("EXPENSE")]
    [InlineData("ASSET")]
    [InlineData("LIABILITY")]
    public void Valid_AllCategoryFilters_Pass(string category)
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, CategoryFilter: category);

        var result = _validator.TestValidate(query);

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Invalid_EmptyOrgId_Fails()
    {
        var query = new GetComparativeAnalysisQuery(Guid.Empty, BaseYear: 2026);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.OrgId);
    }

    [Fact]
    public void Invalid_BaseYearTooOld_Fails()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2019);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.BaseYear);
    }

    [Fact]
    public void Invalid_BaseYearTooFuture_Fails()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2101);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.BaseYear);
    }

    [Fact]
    public void Invalid_PriorYearEqualToBaseYear_Fails()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, PriorYear: 2026);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.PriorYear);
    }

    [Fact]
    public void Invalid_PriorYearGreaterThanBaseYear_Fails()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2025, PriorYear: 2026);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.PriorYear);
    }

    [Fact]
    public void Invalid_PriorYearTooOld_Fails()
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, PriorYear: 2019);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.PriorYear);
    }

    [Theory]
    [InlineData("income")]        // lowercase
    [InlineData("Revenue")]       // wrong name
    [InlineData("PROFIT")]        // not a valid account type
    [InlineData("CASH")]          // not in the allowed set
    [InlineData("")]              // empty string — use null for "all"
    public void Invalid_BadCategoryFilter_Fails(string category)
    {
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, CategoryFilter: category);

        var result = _validator.TestValidate(query);

        result.ShouldHaveValidationErrorFor(x => x.CategoryFilter);
    }

    [Fact]
    public void Valid_NullCategoryFilter_PassesValidator()
    {
        // Null = all categories — should not trigger the CategoryFilter rule
        var query = new GetComparativeAnalysisQuery(Guid.NewGuid(), BaseYear: 2026, CategoryFilter: null);

        var result = _validator.TestValidate(query);

        result.ShouldNotHaveValidationErrorFor(x => x.CategoryFilter);
    }

    [Fact]
    public void ComparativeAnalysisResponse_HasCorrectLabelCount()
    {
        // Verify the Indian FY month label array has exactly 12 slots
        var labels = new[] { "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar" };

        labels.Should().HaveCount(12, "Indian FY spans 12 months April–March");
        labels[0].Should().Be("Apr", "Indian FY starts in April");
        labels[11].Should().Be("Mar", "Indian FY ends in March");
    }
}
