using AiService.Application.Extraction.Commands.ExtractFields;
using FluentValidation;

namespace AiService.Tests;

/// <summary>
/// Validator tests for <see cref="ExtractFieldsCommandValidator"/>.
/// Covers: token cost guardrail, featureCode validation, input requirement.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ExtractFieldsValidatorTests
{
    private readonly IValidator<ExtractFieldsCommand> _validator = new ExtractFieldsCommandValidator();

    private static bool IsValid(IValidator<ExtractFieldsCommand> v, ExtractFieldsCommand cmd)
        => v.Validate(cmd).IsValid;

    private static bool HasErrorFor(IValidator<ExtractFieldsCommand> v, ExtractFieldsCommand cmd, string propName)
        => v.Validate(cmd).Errors.Any(e => e.PropertyName == propName || e.PropertyName == "input");

    [Fact]
    public void Validate_NoDocumentIdOrRawText_Fails()
    {
        var cmd = new ExtractFieldsCommand(null, null, "invoice_extract", null);
        IsValid(_validator, cmd).Should().BeFalse();
    }

    [Fact]
    public void Validate_WithDocumentId_NoRawText_Passes()
    {
        var cmd = new ExtractFieldsCommand(Guid.NewGuid(), null, "invoice_extract", null);
        IsValid(_validator, cmd).Should().BeTrue();
    }

    [Fact]
    public void Validate_WithRawText_NoDocumentId_Passes()
    {
        var cmd = new ExtractFieldsCommand(null, "Some invoice text", "invoice_extract", null);
        IsValid(_validator, cmd).Should().BeTrue();
    }

    [Fact]
    public void Validate_RawTextExceedsLimit_Fails()
    {
        var longText = new string('a', 50_001);
        var cmd = new ExtractFieldsCommand(null, longText, "invoice_extract", null);
        IsValid(_validator, cmd).Should().BeFalse();
        _validator.Validate(cmd).Errors.Should().Contain(e => e.PropertyName == "RawText");
    }

    [Fact]
    public void Validate_RawTextExactlyAtLimit_Passes()
    {
        var limitText = new string('a', 50_000);
        var cmd = new ExtractFieldsCommand(null, limitText, "invoice_extract", null);
        IsValid(_validator, cmd).Should().BeTrue();
    }

    [Fact]
    public void Validate_EmptyFeatureCode_Fails()
    {
        var cmd = new ExtractFieldsCommand(Guid.NewGuid(), null, "", null);
        IsValid(_validator, cmd).Should().BeFalse();
        _validator.Validate(cmd).Errors.Should().Contain(e => e.PropertyName == "FeatureCode");
    }

    [Fact]
    public void Validate_FeatureCodeTooLong_Fails()
    {
        var longCode = new string('x', 65);
        var cmd = new ExtractFieldsCommand(Guid.NewGuid(), null, longCode, null);
        IsValid(_validator, cmd).Should().BeFalse();
        _validator.Validate(cmd).Errors.Should().Contain(e => e.PropertyName == "FeatureCode");
    }

    [Fact]
    public void Validate_ValidCommand_Passes()
    {
        var cmd = new ExtractFieldsCommand(Guid.NewGuid(), "Some text", "invoice_extract", Guid.NewGuid());
        IsValid(_validator, cmd).Should().BeTrue();
    }
}
