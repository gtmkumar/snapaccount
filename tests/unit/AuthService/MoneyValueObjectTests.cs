using FluentAssertions;
using SnapAccount.Shared.Domain.ValueObjects;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests for the Money value object.
/// Key requirements: decimal-only arithmetic, value equality,
/// negative amount rejection, cross-currency guard.
/// Ref: Money.cs in Shared Domain.
/// </summary>
public class MoneyValueObjectTests
{
    // ──────────────────────────────────────────────────────────────
    // Equality
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Money_SameAmountAndCurrency_AreEqual()
    {
        var a = Money.Of(1000m, "INR");
        var b = Money.Of(1000m, "INR");

        (a == b).Should().BeTrue("two Money VOs with identical amount+currency must be equal");
        a.Should().Be(b);
    }

    [Fact]
    public void Money_DifferentAmounts_AreNotEqual()
    {
        var a = Money.Of(1000m, "INR");
        var b = Money.Of(2000m, "INR");

        (a != b).Should().BeTrue();
    }

    [Fact]
    public void Money_DifferentCurrencies_AreNotEqual()
    {
        var a = Money.Of(100m, "INR");
        var b = Money.Of(100m, "USD");

        (a != b).Should().BeTrue("currencies differ — must not be equal");
    }

    // ──────────────────────────────────────────────────────────────
    // Addition
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Add_SameCurrency_ReturnsCorrectSum()
    {
        var a = Money.Of(500m, "INR");
        var b = Money.Of(300m, "INR");

        var sum = a.Add(b);

        sum.Amount.Should().Be(800m, "500 + 300 = 800");
        sum.Currency.Should().Be("INR");
    }

    [Fact]
    public void Add_DifferentCurrencies_ThrowsInvalidOperation()
    {
        var inr = Money.Of(500m, "INR");
        var usd = Money.Of(100m, "USD");

        var act = () => inr.Add(usd);

        act.Should().Throw<InvalidOperationException>("cannot add amounts of different currencies");
    }

    // ──────────────────────────────────────────────────────────────
    // Subtraction
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Subtract_SameCurrency_ReturnsCorrectDifference()
    {
        var a = Money.Of(1000m, "INR");
        var b = Money.Of(400m, "INR");

        var diff = a.Subtract(b);

        diff.Amount.Should().Be(600m, "1000 - 400 = 600");
    }

    [Fact]
    public void Subtract_DifferentCurrencies_ThrowsInvalidOperation()
    {
        var inr = Money.Of(500m, "INR");
        var usd = Money.Of(100m, "USD");

        var act = () => inr.Subtract(usd);

        act.Should().Throw<InvalidOperationException>("cannot subtract amounts of different currencies");
    }

    // ──────────────────────────────────────────────────────────────
    // Negative amount rejection
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Of_NegativeAmount_ThrowsArgumentException()
    {
        var act = () => Money.Of(-1m, "INR");

        act.Should().Throw<ArgumentException>("negative monetary amounts are not permitted");
    }

    // ──────────────────────────────────────────────────────────────
    // Decimal precision — never float/double
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Money_AmountIsDecimalType_NotFloatOrDouble()
    {
        var money = Money.Of(12345.67m, "INR");

        // Verify no floating-point drift — decimal arithmetic is exact
        var result = money.Add(Money.Of(0.01m, "INR"));
        result.Amount.Should().Be(12345.68m, "decimal arithmetic must be exact — no float/double drift");
    }

    [Fact]
    public void Money_AmountRoundedToTwoPaise()
    {
        var money = Money.Of(100.999m, "INR");

        money.Amount.Should().Be(101.00m, "amount must be rounded to 2 decimal places");
    }

    // ──────────────────────────────────────────────────────────────
    // Zero factory
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Zero_ReturnsMoneyWithZeroAmount()
    {
        var zero = Money.Zero("INR");

        zero.Amount.Should().Be(0m);
        zero.Currency.Should().Be("INR");
    }
}
