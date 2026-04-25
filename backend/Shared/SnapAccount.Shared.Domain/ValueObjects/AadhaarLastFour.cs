using System.Text.RegularExpressions;

namespace SnapAccount.Shared.Domain.ValueObjects;

/// <summary>
/// Stores only the last 4 digits of an Aadhaar number.
/// Full Aadhaar numbers must NEVER be stored — UIDAI compliance.
/// </summary>
public sealed class AadhaarLastFour : ValueObject
{
    private static readonly Regex LastFourRegex = new(@"^\d{4}$", RegexOptions.Compiled);

    public string Value { get; }

    private AadhaarLastFour(string value) => Value = value;

    public static Result<AadhaarLastFour> Create(string lastFour)
    {
        var normalized = lastFour?.Trim() ?? string.Empty;
        if (!LastFourRegex.IsMatch(normalized))
            return Error.Validation("AadhaarLastFour.Invalid",
                "Aadhaar last four digits must be exactly 4 numeric digits.");
        return new AadhaarLastFour(normalized);
    }

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Value;
    }

    public override string ToString() => $"XXXX-XXXX-{Value}";
}
