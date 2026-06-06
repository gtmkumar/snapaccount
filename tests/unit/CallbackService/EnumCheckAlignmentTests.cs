using CallbackService.Domain.Enums;
using FluentAssertions;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SnapAccount.Shared.Infrastructure.Persistence;
using Xunit;

namespace CallbackService.Tests;

/// <summary>
/// Locks the callback enum → DB string contract against the CHECK constraints in
/// migration 056_chat_callback_write_alignment.sql. The default HasConversion&lt;string&gt;()
/// persisted PascalCase ("Pending"), which the UPPER_SNAKE CHECK rejected on every write —
/// this test guards the corrected UpperSnakeEnumConverter mapping.
///
/// Expected sets are duplicated from the migration on purpose (double-entry): adding an
/// enum member without the matching CHECK value fails here instead of 500-ing on insert.
/// Category=Unit — pure converter logic, no database.
/// </summary>
public sealed class EnumCheckAlignmentTests
{
    // Mirrors callbacks_status_check (056)
    private static readonly string[] StatusCheck =
        ["PENDING", "ASSIGNED", "CONFIRMED", "COMPLETED", "ESCALATED", "CANCELLED"];

    // Mirrors callbacks_category_check (056)
    private static readonly string[] CategoryCheck =
        ["GENERAL", "GST", "ITR", "LOAN", "ACCOUNTING", "SUBSCRIPTION", "TECHNICAL"];

    // Mirrors callbacks_priority_check (056)
    private static readonly string[] PriorityCheck =
        ["LOW", "NORMAL", "HIGH", "URGENT"];

    [Fact]
    public void Status_converter_emits_only_check_values_and_round_trips() =>
        AssertAligned<CallbackStatus>(new UpperSnakeEnumConverter<CallbackStatus>(), StatusCheck);

    [Fact]
    public void Category_converter_emits_only_check_values_and_round_trips() =>
        AssertAligned<CallbackCategory>(new UpperSnakeEnumConverter<CallbackCategory>(), CategoryCheck);

    [Fact]
    public void Priority_converter_emits_only_check_values_and_round_trips() =>
        AssertAligned<CallbackPriority>(new UpperSnakeEnumConverter<CallbackPriority>(), PriorityCheck);

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
