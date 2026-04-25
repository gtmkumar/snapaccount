using System.Text.RegularExpressions;

namespace SnapAccount.Shared.Domain.ValueObjects;

public sealed class GstinNumber : ValueObject
{
    // 15-character GSTIN: 2-digit state code + 10-char PAN + 1 entity num + Z + check digit
    private static readonly Regex GstinRegex = new(
        @"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
        RegexOptions.Compiled);

    public string Value { get; }

    private GstinNumber(string value) => Value = value;

    public static Result<GstinNumber> Create(string gstin)
    {
        var normalized = gstin?.Trim().ToUpperInvariant() ?? string.Empty;
        if (normalized.Length != 15 || !GstinRegex.IsMatch(normalized))
            return Error.Validation("GstinNumber.Invalid",
                "GSTIN must be a valid 15-character GST identification number.");
        return new GstinNumber(normalized);
    }

    public string GetStateCode() => Value[..2];
    public string GetPan() => Value[2..12];

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Value;
    }

    public override string ToString() => Value;
}
