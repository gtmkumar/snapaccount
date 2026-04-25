namespace SnapAccount.Shared.Domain.ValueObjects;

public sealed class Money : ValueObject
{
    public decimal Amount { get; }
    public string Currency { get; }

    private Money(decimal amount, string currency)
    {
        Amount = Math.Round(amount, 2);
        Currency = currency;
    }

    public static Money Of(decimal amount, string currency = "INR")
    {
        if (amount < 0)
            throw new ArgumentException("Amount cannot be negative.", nameof(amount));
        return new Money(amount, currency);
    }

    public static Money Zero(string currency = "INR") => new(0m, currency);

    public Money Add(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException($"Cannot add {Currency} and {other.Currency}.");
        return new Money(Amount + other.Amount, Currency);
    }

    public Money Subtract(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException($"Cannot subtract {Currency} and {other.Currency}.");
        return new Money(Amount - other.Amount, Currency);
    }

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Amount;
        yield return Currency;
    }

    public override string ToString() => $"{Currency} {Amount:F2}";
}
