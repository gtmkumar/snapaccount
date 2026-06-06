using ChatService.Domain.Enums;
using FluentAssertions;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SnapAccount.Shared.Infrastructure.Persistence;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Locks the chat enum → DB string contract: the value the EF converter persists for
/// every enum member MUST be one of the exact values allowed by the CHECK constraints in
/// migration 056_chat_callback_write_alignment.sql, and must round-trip.
///
/// These expected sets are deliberately duplicated from the migration (double-entry
/// bookkeeping). If someone adds an enum member without adding the matching CHECK value
/// (or vice-versa), this test fails in CI instead of 500-ing at runtime on insert.
/// Category=Unit — pure converter logic, no database.
/// </summary>
public sealed class EnumCheckAlignmentTests
{
    // Mirrors threads_status_check (056)
    private static readonly string[] ThreadStatusCheck =
        ["OPEN", "PENDING_USER", "RESOLVED", "ESCALATED", "REOPENED"];

    // Mirrors thread_participants_role_check (056)
    private static readonly string[] ParticipantRoleCheck =
        ["USER", "AGENT", "CA", "LOAN_OFFICER", "BOT"];

    // Mirrors chat.messages.sender_role CHECK (029, unchanged)
    private static readonly string[] SenderRoleCheck =
        ["USER", "CA", "ADMIN", "SYSTEM", "AI"];

    // Mirrors chat.threads category CHECK (029, unchanged — matches ThreadCategory)
    private static readonly string[] CategoryCheck =
        ["GST", "ITR", "DOC", "LOAN", "BILLING", "GENERAL"];

    [Fact]
    public void ThreadStatus_converter_emits_only_check_values_and_round_trips() =>
        AssertAligned<ThreadStatus>(new UpperSnakeEnumConverter<ThreadStatus>(), ThreadStatusCheck);

    [Fact]
    public void ParticipantRole_converter_emits_only_check_values_and_round_trips() =>
        AssertAligned<ParticipantRole>(new UpperSnakeEnumConverter<ParticipantRole>(), ParticipantRoleCheck);

    [Fact]
    public void MessageSenderRole_converter_emits_only_check_values_and_round_trips() =>
        AssertAligned<MessageSenderRole>(new UpperSnakeEnumConverter<MessageSenderRole>(), SenderRoleCheck);

    [Fact]
    public void ThreadCategory_converter_strings_match_category_check()
    {
        // ThreadCategory uses the default HasConversion<string>() (member names already
        // equal the CHECK vocabulary); assert that assumption holds.
        foreach (var v in Enum.GetValues<ThreadCategory>())
            CategoryCheck.Should().Contain(v.ToString(),
                $"ThreadCategory.{v} must be a valid threads.category CHECK value");
    }

    private static void AssertAligned<TEnum>(ValueConverter<TEnum, string> converter, string[] allowed)
        where TEnum : struct, Enum
    {
        var toProvider = converter.ConvertToProvider;
        var fromProvider = converter.ConvertFromProvider;

        foreach (var value in Enum.GetValues<TEnum>())
        {
            var db = (string)toProvider(value)!;
            allowed.Should().Contain(db,
                $"{typeof(TEnum).Name}.{value} persists as '{db}', which must be a valid CHECK value");

            var roundTrip = (TEnum)fromProvider(db)!;
            roundTrip.Should().Be(value, $"'{db}' must read back to {typeof(TEnum).Name}.{value}");
        }
    }
}
