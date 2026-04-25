using System.Text.RegularExpressions;
using SnapAccount.Shared.Domain;

namespace GstService.Domain.ValueObjects;

public sealed class HsnCode : ValueObject
{
    // HSN: 2-8 digits; SAC: 6 digits starting with 99
    private static readonly Regex HsnRegex = new(@"^\d{2,8}$", RegexOptions.Compiled);

    public string Value { get; }
    public string Type { get; } // HSN or SAC

    private HsnCode(string value, string type) { Value = value; Type = type; }

    public static Result<HsnCode> Create(string code)
    {
        var normalized = code?.Trim() ?? string.Empty;
        if (!HsnRegex.IsMatch(normalized))
            return Error.Validation("HsnCode.Invalid", "HSN/SAC code must be 2-8 digits.");

        var type = normalized.StartsWith("99") && normalized.Length == 6 ? "SAC" : "HSN";
        return new HsnCode(normalized, type);
    }

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Value;
    }

    public override string ToString() => $"{Type}:{Value}";
}
