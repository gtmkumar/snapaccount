using System.Text.RegularExpressions;

namespace SnapAccount.Shared.Domain.ValueObjects;

public sealed class PhoneNumber : ValueObject
{
    private static readonly Regex IndianPhoneRegex = new(@"^[6-9]\d{9}$", RegexOptions.Compiled);

    public string Value { get; }

    private PhoneNumber(string value) => Value = value;

    public static Result<PhoneNumber> Create(string phone)
    {
        var normalized = phone?.Replace("+91", "").Trim() ?? string.Empty;
        if (!IndianPhoneRegex.IsMatch(normalized))
            return Error.Validation("PhoneNumber.Invalid",
                "Phone number must be a valid Indian mobile number (starts with 6-9, 10 digits).");
        return new PhoneNumber(normalized);
    }

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Value;
    }

    public override string ToString() => Value;
    public string ToE164() => $"+91{Value}";
}
