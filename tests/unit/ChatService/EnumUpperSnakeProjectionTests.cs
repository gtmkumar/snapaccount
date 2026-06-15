using ChatService.Application.Common;
using ChatService.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Regression suite for BUG-W7-001: enum DTO projection casing contract.
///
/// Root cause: DTO projections called <c>.ToString()</c> inside EF LINQ Select()
/// expressions, which emits the PascalCase member name ("Confirmed") instead of the
/// UPPER_SNAKE DB / mobile contract value ("CONFIRMED").  The mobile client's
/// <c>statusVisual()</c> switch on "CONFIRMED" received "Confirmed" → returned
/// <c>undefined</c> → crash on the Past appointments tab.
///
/// Fix: all enum-to-string projections go through <see cref="EnumUpperSnake.Serialize{TEnum}"/>
/// on materialised (post-ToListAsync) data.
///
/// These tests fail if anyone reverts to <c>.ToString()</c> or adds a new enum member
/// without verifying the UPPER_SNAKE output matches the mobile contract / CHECK constraint.
///
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class EnumUpperSnakeProjectionTests
{
    // ── AppointmentStatus (BUG-W7-001 epicentre) ──────────────────────────────

    [Theory]
    [InlineData(AppointmentStatus.Draft,     "DRAFT")]
    [InlineData(AppointmentStatus.Confirmed, "CONFIRMED")]
    [InlineData(AppointmentStatus.Completed, "COMPLETED")]
    [InlineData(AppointmentStatus.Cancelled, "CANCELLED")]
    [InlineData(AppointmentStatus.NoShow,    "NO_SHOW")]
    public void AppointmentStatus_Serialize_MatchesMobileContract(AppointmentStatus value, string expected)
    {
        EnumUpperSnake.Serialize(value).Should().Be(expected,
            $"mobile statusVisual() switch key for {value} must be \"{expected}\"");
    }

    [Fact]
    public void AppointmentStatus_Confirmed_NeverReturnsPascalCase()
    {
        // Explicit guard: the original bug was "Confirmed" reaching the mobile client.
        EnumUpperSnake.Serialize(AppointmentStatus.Confirmed).Should().NotBe("Confirmed",
            "PascalCase 'Confirmed' breaks mobile statusVisual() — must be 'CONFIRMED'");
    }

    [Fact]
    public void AppointmentStatus_NoShow_HasUnderscore()
    {
        // Two-word enum member must get an underscore: NoShow → NO_SHOW, not NOSHOW.
        EnumUpperSnake.Serialize(AppointmentStatus.NoShow).Should().Be("NO_SHOW");
    }

    [Fact]
    public void AppointmentStatus_AllValues_AreInCheckVocabulary()
    {
        // Mirror of migration 086 / chat.appointments.status CHECK constraint.
        string[] checkValues = ["DRAFT", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

        foreach (var v in Enum.GetValues<AppointmentStatus>())
            checkValues.Should().Contain(EnumUpperSnake.Serialize(v),
                $"AppointmentStatus.{v} must map to a CHECK-constraint value");
    }

    // ── MessageSenderRole ──────────────────────────────────────────────────────

    [Theory]
    [InlineData(MessageSenderRole.User,   "USER")]
    [InlineData(MessageSenderRole.CA,     "CA")]
    [InlineData(MessageSenderRole.Admin,  "ADMIN")]
    [InlineData(MessageSenderRole.System, "SYSTEM")]
    [InlineData(MessageSenderRole.AI,     "AI")]
    public void MessageSenderRole_Serialize_MatchesMobileContract(MessageSenderRole value, string expected)
    {
        EnumUpperSnake.Serialize(value).Should().Be(expected,
            $"mobile roleLabel() switch key for {value} must be \"{expected}\"");
    }

    [Fact]
    public void MessageSenderRole_User_NeverReturnsPascalCase()
    {
        EnumUpperSnake.Serialize(MessageSenderRole.User).Should().NotBe("User",
            "PascalCase 'User' breaks mobile bookmark sender-role display — must be 'USER'");
    }

    [Fact]
    public void MessageSenderRole_AllValues_AreInCheckVocabulary()
    {
        string[] checkValues = ["USER", "CA", "ADMIN", "SYSTEM", "AI"];

        foreach (var v in Enum.GetValues<MessageSenderRole>())
            checkValues.Should().Contain(EnumUpperSnake.Serialize(v),
                $"MessageSenderRole.{v} must map to a CHECK-constraint value");
    }

    // ── ThreadStatus ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData(ThreadStatus.Open,        "OPEN")]
    [InlineData(ThreadStatus.PendingUser, "PENDING_USER")]
    [InlineData(ThreadStatus.Resolved,    "RESOLVED")]
    [InlineData(ThreadStatus.Escalated,   "ESCALATED")]
    [InlineData(ThreadStatus.Reopened,    "REOPENED")]
    public void ThreadStatus_Serialize_MatchesMobileContract(ThreadStatus value, string expected)
    {
        EnumUpperSnake.Serialize(value).Should().Be(expected,
            $"mobile inbox/detail status field for {value} must be \"{expected}\"");
    }

    [Fact]
    public void ThreadStatus_PendingUser_NeverReturnsPascalCase()
    {
        EnumUpperSnake.Serialize(ThreadStatus.PendingUser).Should().NotBe("PendingUser",
            "PascalCase 'PendingUser' breaks mobile thread-inbox filter — must be 'PENDING_USER'");
    }

    [Fact]
    public void ThreadStatus_AllValues_AreInCheckVocabulary()
    {
        string[] checkValues = ["OPEN", "PENDING_USER", "RESOLVED", "ESCALATED", "REOPENED"];

        foreach (var v in Enum.GetValues<ThreadStatus>())
            checkValues.Should().Contain(EnumUpperSnake.Serialize(v),
                $"ThreadStatus.{v} must map to a CHECK-constraint value");
    }

    // ── ParticipantRole ────────────────────────────────────────────────────────

    [Theory]
    [InlineData(ParticipantRole.User,        "USER")]
    [InlineData(ParticipantRole.Agent,       "AGENT")]
    [InlineData(ParticipantRole.CA,          "CA")]
    [InlineData(ParticipantRole.LoanOfficer, "LOAN_OFFICER")]
    [InlineData(ParticipantRole.Bot,         "BOT")]
    public void ParticipantRole_Serialize_MatchesMobileContract(ParticipantRole value, string expected)
    {
        EnumUpperSnake.Serialize(value).Should().Be(expected,
            $"mobile participant-role field for {value} must be \"{expected}\"");
    }

    [Fact]
    public void ParticipantRole_LoanOfficer_HasUnderscore()
    {
        EnumUpperSnake.Serialize(ParticipantRole.LoanOfficer).Should().Be("LOAN_OFFICER");
    }

    [Fact]
    public void ParticipantRole_AllValues_AreInCheckVocabulary()
    {
        string[] checkValues = ["USER", "AGENT", "CA", "LOAN_OFFICER", "BOT"];

        foreach (var v in Enum.GetValues<ParticipantRole>())
            checkValues.Should().Contain(EnumUpperSnake.Serialize(v),
                $"ParticipantRole.{v} must map to a CHECK-constraint value");
    }

    // ── ThreadCategory ─────────────────────────────────────────────────────────
    // ThreadCategory members ARE already UPPER_SNAKE (GST, ITR, DOC, LOAN, BILLING,
    // GENERAL) so .ToString() was coincidentally correct — but the fix uses
    // EnumUpperSnake.Serialize uniformly for future-proofing.

    [Theory]
    [InlineData(ThreadCategory.GST,     "GST")]
    [InlineData(ThreadCategory.ITR,     "ITR")]
    [InlineData(ThreadCategory.DOC,     "DOC")]
    [InlineData(ThreadCategory.LOAN,    "LOAN")]
    [InlineData(ThreadCategory.BILLING, "BILLING")]
    [InlineData(ThreadCategory.GENERAL, "GENERAL")]
    public void ThreadCategory_Serialize_MatchesMobileContract(ThreadCategory value, string expected)
    {
        EnumUpperSnake.Serialize(value).Should().Be(expected,
            $"mobile inbox category filter for {value} must be \"{expected}\"");
    }

    // ── EnumUpperSnake helper contract ─────────────────────────────────────────

    [Fact]
    public void EnumUpperSnake_SingleWord_UpperCasesOnly()
    {
        // "Confirmed" → "CONFIRMED" (no underscore added for single-word members)
        EnumUpperSnake.Serialize(AppointmentStatus.Confirmed).Should().Be("CONFIRMED");
        EnumUpperSnake.Serialize(AppointmentStatus.Cancelled).Should().Be("CANCELLED");
    }

    [Fact]
    public void EnumUpperSnake_TwoWordCamelCase_InsertsUnderscore()
    {
        // "NoShow" → "NO_SHOW", "PendingUser" → "PENDING_USER"
        EnumUpperSnake.Serialize(AppointmentStatus.NoShow).Should().Be("NO_SHOW");
        EnumUpperSnake.Serialize(ThreadStatus.PendingUser).Should().Be("PENDING_USER");
        EnumUpperSnake.Serialize(ParticipantRole.LoanOfficer).Should().Be("LOAN_OFFICER");
    }

    [Fact]
    public void EnumUpperSnake_Acronym_PreservesAcronym()
    {
        // All-caps acronyms (CA, AI, GST, ITR) must not have underscores injected.
        EnumUpperSnake.Serialize(MessageSenderRole.CA).Should().Be("CA");
        EnumUpperSnake.Serialize(MessageSenderRole.AI).Should().Be("AI");
        EnumUpperSnake.Serialize(ThreadCategory.GST).Should().Be("GST");
        EnumUpperSnake.Serialize(ThreadCategory.ITR).Should().Be("ITR");
    }
}
