using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace SnapAccount.Shared.Infrastructure.Persistence;

/// <summary>
/// EF Core value converter that persists an enum as the UPPER_SNAKE_CASE form of its
/// member name and reads it back, e.g.
/// <c>ThreadStatus.PendingUser ↔ "PENDING_USER"</c>, <c>ParticipantRole.CA ↔ "CA"</c>,
/// <c>CallbackStatus.Pending ↔ "PENDING"</c>.
///
/// The chat/callback tables are created by the canonical SQL migrations (there are no
/// EF migrations for those services); their status/category/priority/role columns are
/// <c>VARCHAR + CHECK</c> using UPPER_SNAKE vocabularies. The default
/// <c>HasConversion&lt;string&gt;()</c> persists the PascalCase member name verbatim
/// ("Pending", "PendingUser"), which violates those CHECK constraints on every write.
/// This converter emits the exact CHECK vocabulary so writes succeed and round-trip.
///
/// The mapping is derived once from the enum members, so it stays in sync automatically
/// when an enum member is added — the matching CHECK value must be added in a migration.
/// </summary>
public sealed class UpperSnakeEnumConverter<TEnum> : ValueConverter<TEnum, string>
    where TEnum : struct, Enum
{
    /// <summary>Creates the converter.</summary>
    public UpperSnakeEnumConverter()
        : base(v => ToDb(v), s => FromDb(s))
    {
    }

    private static readonly IReadOnlyDictionary<TEnum, string> ToMap =
        Enum.GetValues<TEnum>().ToDictionary(v => v, v => ToUpperSnake(v.ToString()));

    private static readonly IReadOnlyDictionary<string, TEnum> FromMap =
        ToMap.ToDictionary(kv => kv.Value, kv => kv.Key, StringComparer.Ordinal);

    /// <summary>PascalCase → UPPER_SNAKE_CASE (acronyms stay intact: "CA" → "CA", "GST" → "GST").</summary>
    private static string ToUpperSnake(string name) =>
        Regex.Replace(name, "(?<=[a-z0-9])([A-Z])", "_$1").ToUpperInvariant();

    private static string ToDb(TEnum value) =>
        ToMap.TryGetValue(value, out var s)
            ? s
            : throw new ArgumentOutOfRangeException(nameof(value), value, $"Unmapped {typeof(TEnum).Name} value.");

    private static TEnum FromDb(string value) =>
        FromMap.TryGetValue(value, out var e)
            ? e
            : throw new ArgumentOutOfRangeException(nameof(value), value, $"Unknown {typeof(TEnum).Name} string '{value}'.");
}
