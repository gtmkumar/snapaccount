using System.Text.RegularExpressions;

namespace SnapAccount.Shared.Domain.ValueObjects;

/// <summary>
/// Tax Deduction and Collection Account Number (TAN).
/// Format: AAAA99999A — 4 uppercase alpha, 5 digits, 1 uppercase alpha.
/// Example: PNES03028F
/// </summary>
public sealed class TanNumber : ValueObject
{
    // Format: ^[A-Z]{4}[0-9]{5}[A-Z]{1}$ (10 characters total)
    private static readonly Regex TanRegex = new(@"^[A-Z]{4}[0-9]{5}[A-Z]{1}$", RegexOptions.Compiled);

    /// <summary>Normalised (uppercase) TAN value.</summary>
    public string Value { get; }

    private TanNumber(string value) => Value = value;

    /// <summary>
    /// Creates a <see cref="TanNumber"/> from the supplied string.
    /// Returns <c>Result.Failure</c> when the format is invalid.
    /// </summary>
    public static Result<TanNumber> Create(string tan)
    {
        var normalized = tan?.Trim().ToUpperInvariant() ?? string.Empty;
        if (!TanRegex.IsMatch(normalized))
            return Error.Validation("TanNumber.Invalid",
                "TAN must be in format AAAA99999A (4 letters, 5 digits, 1 letter).");
        return new TanNumber(normalized);
    }

    /// <inheritdoc />
    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Value;
    }

    /// <inheritdoc />
    public override string ToString() => Value;
}
