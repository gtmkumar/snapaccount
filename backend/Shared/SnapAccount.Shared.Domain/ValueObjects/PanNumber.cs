using System.Text.RegularExpressions;

namespace SnapAccount.Shared.Domain.ValueObjects;

public sealed class PanNumber : ValueObject
{
    // Format: XXXXX9999X (5 uppercase alpha, 4 digits, 1 uppercase alpha)
    private static readonly Regex PanRegex = new(@"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", RegexOptions.Compiled);

    public string Value { get; }

    private PanNumber(string value) => Value = value;

    public static Result<PanNumber> Create(string pan)
    {
        var normalized = pan?.Trim().ToUpperInvariant() ?? string.Empty;
        if (!PanRegex.IsMatch(normalized))
            return Error.Validation("PanNumber.Invalid",
                "PAN number must be in format XXXXX9999X (5 letters, 4 digits, 1 letter).");
        return new PanNumber(normalized);
    }

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Value;
    }

    public override string ToString() => Value;
}
