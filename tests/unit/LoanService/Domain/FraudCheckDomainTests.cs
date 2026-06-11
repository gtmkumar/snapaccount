using LoanService.Domain.Entities;

namespace LoanService.Tests.Domain;

/// <summary>
/// Unit tests for FraudCheck domain entity — GAP-110.
/// Validates verdict semantics, decision log append pattern, and factory invariants.
/// </summary>
public sealed class FraudCheckDomainTests
{
    [Fact]
    public void FraudCheck_Create_SetsAllProperties()
    {
        var appId = Guid.NewGuid();
        var result = FraudCheck.Create(appId, FraudCheckType.DuplicatePan, FraudVerdict.Pass, "No duplicate detected");

        result.ApplicationId.Should().Be(appId);
        result.CheckType.Should().Be(FraudCheckType.DuplicatePan);
        result.Verdict.Should().Be(FraudVerdict.Pass);
        result.DecisionNote.Should().Be("No duplicate detected");
        result.CheckedAt.Should().BeCloseTo(DateTime.UtcNow, precision: TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void FraudCheck_Create_PassVerdict_DoesNotBlock()
    {
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.VelocityPan, FraudVerdict.Pass, "Within velocity window");

        check.Verdict.Should().NotBe(FraudVerdict.Fail, "Pass verdict must never block submission");
    }

    [Fact]
    public void FraudCheck_Create_FlagVerdict_AllowsSubmission()
    {
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.DuplicatePhone, FraudVerdict.Flag, "Phone seen in 1 other org");

        // FLAG = soft signal; submission not blocked; operator gets a note
        check.Verdict.Should().Be(FraudVerdict.Flag);
        check.DecisionNote.Should().NotBeEmpty("Flag verdict must include a decision note for the operator");
    }

    [Fact]
    public void FraudCheck_Create_FailVerdict_MustHaveNote()
    {
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.VelocityPan, FraudVerdict.Fail, "HARD FAIL: 5+ applications in 30 days");

        check.Verdict.Should().Be(FraudVerdict.Fail);
        check.DecisionNote.Should().NotBeEmpty("Fail verdict must document reason for blocking");
    }

    [Fact]
    public void FraudCheck_Create_PennyDrop_WithDetails()
    {
        using var details = System.Text.Json.JsonDocument.Parse("{\"similarity_score\":0.61,\"beneficiary_name\":\"John Doe\"}");
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.PennyDrop, FraudVerdict.Flag, "Name similarity below threshold", details);

        check.CheckType.Should().Be(FraudCheckType.PennyDrop);
        check.Details.Should().NotBeNull();
    }

    [Fact]
    public void FraudCheck_Create_WithNullDetails_IsValid()
    {
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.DuplicateDevice, FraudVerdict.Pass, "No other-org device matches");

        check.Details.Should().BeNull("Details is optional for Pass verdicts");
    }

    [Theory]
    [InlineData(FraudCheckType.DuplicatePan)]
    [InlineData(FraudCheckType.DuplicatePhone)]
    [InlineData(FraudCheckType.DuplicateDevice)]
    [InlineData(FraudCheckType.VelocityPan)]
    [InlineData(FraudCheckType.VelocityPhone)]
    [InlineData(FraudCheckType.PennyDrop)]
    public void FraudCheckType_AllTypes_CanBeCreated(FraudCheckType checkType)
    {
        var check = FraudCheck.Create(Guid.NewGuid(), checkType, FraudVerdict.Pass, "test");

        check.CheckType.Should().Be(checkType);
    }

    [Fact]
    public void FraudCheck_DecisionNote_IsNeverNull()
    {
        // Even with empty string, should never be null (domain invariant)
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.VelocityPhone, FraudVerdict.Pass, string.Empty);

        check.DecisionNote.Should().NotBeNull();
    }

    [Fact]
    public void FraudCheck_CheckedAt_IsUtc()
    {
        var before = DateTime.UtcNow;
        var check = FraudCheck.Create(Guid.NewGuid(), FraudCheckType.DuplicatePan, FraudVerdict.Pass, "test");
        var after = DateTime.UtcNow;

        check.CheckedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }
}
