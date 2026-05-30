// Unit tests: Increment 1.4 Phase A — Reference Data CRUD
//
// Tests the domain entity and the CreateReferenceDataCommandValidator.
// No EF Core / IAuthDbContext dependency — pure in-memory.

using AuthService.Application.ReferenceData.Commands.CreateReferenceData;
using AuthService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AuthService.Tests;

// ─────────────────────────────────────────────────────────────────────────────
// 1. ReferenceData entity
// ─────────────────────────────────────────────────────────────────────────────

public class ReferenceDataEntityPhaseATests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void Create_SetsAllProperties()
    {
        var entry = AuthService.Domain.Entities.ReferenceData.Create(
            "COUNTRY", "IN", "India", null, sortOrder: 1);

        entry.Category.Should().Be("COUNTRY");
        entry.Code.Should().Be("IN");
        entry.Name.Should().Be("India");
        entry.ParentCode.Should().BeNull();
        entry.SortOrder.Should().Be(1);
        entry.IsActive.Should().BeTrue("new entry is active by default");
        entry.Id.Should().NotBe(Guid.Empty);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_TrimsAndUppercasesCategory()
    {
        var entry = AuthService.Domain.Entities.ReferenceData.Create(
            " language ", "en", "English", null, 0);

        entry.Category.Should().Be("LANGUAGE",
            "category is always stored trimmed and uppercased");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_TrimsCode()
    {
        var entry = AuthService.Domain.Entities.ReferenceData.Create(
            "GENDER", " MALE ", "Male", null, 0);

        entry.Code.Should().Be("MALE",
            "code is trimmed (but NOT uppercased — case preserved)");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_WithParentCode_SetsParentCode()
    {
        var state = AuthService.Domain.Entities.ReferenceData.Create(
            "STATE", "KA", "Karnataka", "IN", 11);

        state.ParentCode.Should().Be("IN");
        state.Category.Should().Be("STATE");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdateDetails_ChangesNameAndSortOrder()
    {
        var entry = AuthService.Domain.Entities.ReferenceData.Create(
            "COUNTRY", "IN", "India", null, 1);

        entry.UpdateDetails("India (Republic)", null, 10);

        entry.Name.Should().Be("India (Republic)");
        entry.SortOrder.Should().Be(10);
        entry.Category.Should().Be("COUNTRY", "category is immutable");
        entry.Code.Should().Be("IN", "code is immutable");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void SetActive_TogglesIsActive()
    {
        var entry = AuthService.Domain.Entities.ReferenceData.Create(
            "LANGUAGE", "ta", "Tamil", null, 5);

        entry.SetActive(false);
        entry.IsActive.Should().BeFalse();

        entry.SetActive(true);
        entry.IsActive.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_SoftDeleteDefaultIsNull()
    {
        var entry = AuthService.Domain.Entities.ReferenceData.Create(
            "GENDER", "OTHER", "Other", null, 3);

        entry.DeletedAt.Should().BeNull("new entry is not soft-deleted");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void TwoEntries_HaveDifferentIds()
    {
        var a = AuthService.Domain.Entities.ReferenceData.Create("COUNTRY", "IN", "India", null, 1);
        var b = AuthService.Domain.Entities.ReferenceData.Create("COUNTRY", "US", "USA", null, 2);

        a.Id.Should().NotBe(b.Id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ReferenceDataCategory constants
// ─────────────────────────────────────────────────────────────────────────────

public class ReferenceDataCategoryPhaseATests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void All_ContainsExactlyFiveCategories()
    {
        ReferenceDataCategory.All.Should().HaveCount(5,
            "the catalog defines LANGUAGE, USER_TYPE, GENDER, STATE, COUNTRY");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("LANGUAGE")]
    [InlineData("USER_TYPE")]
    [InlineData("GENDER")]
    [InlineData("STATE")]
    [InlineData("COUNTRY")]
    public void All_ContainsExpectedCategories(string category)
    {
        ReferenceDataCategory.All.Should().Contain(category);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Constants_MatchStaticValues()
    {
        ReferenceDataCategory.Language.Should().Be("LANGUAGE");
        ReferenceDataCategory.UserType.Should().Be("USER_TYPE");
        ReferenceDataCategory.Gender.Should().Be("GENDER");
        ReferenceDataCategory.State.Should().Be("STATE");
        ReferenceDataCategory.Country.Should().Be("COUNTRY");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CreateReferenceDataCommandValidator
// ─────────────────────────────────────────────────────────────────────────────

public class CreateReferenceDataCommandValidatorPhaseATests
{
    private readonly CreateReferenceDataCommandValidator _validator = new();

    // ── Valid category ────────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("LANGUAGE")]
    [InlineData("USER_TYPE")]
    [InlineData("GENDER")]
    [InlineData("STATE")]
    [InlineData("COUNTRY")]
    public void Validate_ValidCategory_Passes(string category)
    {
        var cmd = new CreateReferenceDataCommand(category, "CODE", "Name", null, 0);
        _validator.Validate(cmd).IsValid.Should().BeTrue($"'{category}' is a valid category");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("UNKNOWN")]
    [InlineData("CITY")]
    [InlineData("")]
    // Note: lowercase "state" PASSES because the validator normalises to uppercase before checking.
    // That is intentional — the validator is forgiving on case; the handler also normalises.
    public void Validate_InvalidCategory_Fails(string category)
    {
        var cmd = new CreateReferenceDataCommand(category, "CODE", "Name", null, 0);
        _validator.Validate(cmd).IsValid.Should().BeFalse($"'{category}' is not a valid category");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_LowercaseCategory_Passes_Because_ValidatorNormalisesToUpper()
    {
        // The validator does Trim().ToUpperInvariant() before checking — lowercase variants
        // of valid categories ARE accepted. This is intentional: the handler also normalises.
        var cmd = new CreateReferenceDataCommand("state", "KA", "Karnataka", "IN", 0);
        _validator.Validate(cmd).IsValid.Should().BeTrue(
            "validator normalises 'state' → 'STATE' before checking the allowed set");
    }

    // ── Valid code format ─────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("en")]
    [InlineData("IN")]
    [InlineData("KA")]
    [InlineData("BUSINESS_OWNER")]
    [InlineData("abc-123")]
    [InlineData("A")]
    public void Validate_ValidCode_Passes(string code)
    {
        var cmd = new CreateReferenceDataCommand("COUNTRY", code, "Name", null, 0);
        _validator.Validate(cmd).IsValid.Should().BeTrue($"code '{code}' must be valid");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("has space")]
    [InlineData("has.dot")]
    [InlineData("has@at")]
    [InlineData("")]
    public void Validate_InvalidCode_Fails(string code)
    {
        var cmd = new CreateReferenceDataCommand("COUNTRY", code, "Name", null, 0);
        _validator.Validate(cmd).IsValid.Should().BeFalse($"code '{code}' must fail validation");
    }

    // ── Name required ─────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_EmptyName_Fails()
    {
        var cmd = new CreateReferenceDataCommand("COUNTRY", "IN", "", null, 0);
        _validator.Validate(cmd).IsValid.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_NameOver300Chars_Fails()
    {
        var cmd = new CreateReferenceDataCommand(
            "COUNTRY", "IN", new string('x', 301), null, 0);
        _validator.Validate(cmd).IsValid.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_NameExactly300Chars_Passes()
    {
        var cmd = new CreateReferenceDataCommand(
            "COUNTRY", "IN", new string('x', 300), null, 0);
        _validator.Validate(cmd).IsValid.Should().BeTrue("300-char name is at the limit");
    }

    // ── Code max length ───────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_CodeOver100Chars_Fails()
    {
        var longCode = new string('A', 101);
        var cmd = new CreateReferenceDataCommand("COUNTRY", longCode, "Name", null, 0);
        _validator.Validate(cmd).IsValid.Should().BeFalse();
    }
}
