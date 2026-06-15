using AiService.Application.Chat.Queries.AiChat;
using FluentValidation;

namespace AiService.Tests;

/// <summary>
/// Validator tests for <see cref="AiChatQueryValidator"/>.
/// Covers: message length guardrail, org requirement, topK bounds.
/// </summary>
[Trait("Category", "Unit")]
public sealed class AiChatValidatorTests
{
    private readonly IValidator<AiChatQuery> _validator = new AiChatQueryValidator();

    [Fact]
    public void Validate_EmptyMessage_Fails()
    {
        var q = new AiChatQuery("", Guid.NewGuid(), null, "en");
        _validator.Validate(q).IsValid.Should().BeFalse();
        _validator.Validate(q).Errors.Should().Contain(e => e.PropertyName == "Message");
    }

    [Fact]
    public void Validate_MessageExceedsLimit_Fails()
    {
        var longMessage = new string('a', 2_001);
        var q = new AiChatQuery(longMessage, Guid.NewGuid(), null, "en");
        _validator.Validate(q).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_MessageExactlyAtLimit_Passes()
    {
        var limitMessage = new string('a', 2_000);
        var q = new AiChatQuery(limitMessage, Guid.NewGuid(), null, "en");
        _validator.Validate(q).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_EmptyOrganizationId_Fails()
    {
        var q = new AiChatQuery("What is my GST due?", Guid.Empty, null, "en");
        _validator.Validate(q).IsValid.Should().BeFalse();
        _validator.Validate(q).Errors.Should().Contain(e => e.PropertyName == "OrganizationId");
    }

    [Fact]
    public void Validate_TopKTooHigh_Fails()
    {
        var q = new AiChatQuery("test", Guid.NewGuid(), null, "en", TopK: 11);
        _validator.Validate(q).IsValid.Should().BeFalse();
        _validator.Validate(q).Errors.Should().Contain(e => e.PropertyName == "TopK");
    }

    [Fact]
    public void Validate_TopKZero_Fails()
    {
        var q = new AiChatQuery("test", Guid.NewGuid(), null, "en", TopK: 0);
        _validator.Validate(q).IsValid.Should().BeFalse();
        _validator.Validate(q).Errors.Should().Contain(e => e.PropertyName == "TopK");
    }

    [Fact]
    public void Validate_ValidQuery_Passes()
    {
        var q = new AiChatQuery(
            "What is my GST liability for March 2026?",
            Guid.NewGuid(), null, "en", TopK: 5);
        _validator.Validate(q).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_IndicLocale_Passes()
    {
        var q = new AiChatQuery("मेरा जीएसटी कितना है?", Guid.NewGuid(), null, "hi");
        _validator.Validate(q).IsValid.Should().BeTrue();
    }
}
