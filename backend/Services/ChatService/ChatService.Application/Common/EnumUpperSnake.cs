using System.Text.RegularExpressions;

namespace ChatService.Application.Common;

/// <summary>
/// Application-layer helper for serialising enum values to the UPPER_SNAKE_CASE
/// contract expected by the mobile client's <c>statusVisual()</c> / <c>roleLabel()</c>
/// switch statements.
///
/// Mirrors the algorithm in <c>UpperSnakeEnumConverter&lt;TEnum&gt;</c>
/// (SnapAccount.Shared.Infrastructure) but lives in the Application layer so it
/// can be called on materialised (post-<c>ToListAsync</c>) enum values without
/// pulling an EF Core dependency into Application or attempting EF LINQ translation
/// of a custom method.
///
/// BUG-W7-001 root-cause: projection queries called <c>.ToString()</c> directly on
/// enum values inside EF LINQ expressions — EF emits the PascalCase member name
/// ("Confirmed") instead of the UPPER_SNAKE DB value ("CONFIRMED").  All DTO
/// projections that serialise an enum to a <c>string</c> field MUST go through
/// <see cref="Serialize{TEnum}"/>.
/// </summary>
public static class EnumUpperSnake
{
    // Compiled once; hot path safe.
    private static readonly Regex SplitPattern =
        new("(?<=[a-z0-9])([A-Z])", RegexOptions.Compiled, TimeSpan.FromSeconds(1));

    /// <summary>
    /// Converts an enum member to UPPER_SNAKE_CASE — e.g.
    /// <c>AppointmentStatus.NoShow → "NO_SHOW"</c>,
    /// <c>MessageSenderRole.CA → "CA"</c>,
    /// <c>ThreadStatus.PendingUser → "PENDING_USER"</c>.
    /// </summary>
    public static string Serialize<TEnum>(TEnum value) where TEnum : struct, Enum =>
        SplitPattern.Replace(value.ToString(), "_$1").ToUpperInvariant();
}
