using FluentAssertions;
using SnapAccount.Shared.Domain.ValueObjects;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests for the PhoneNumber value object.
/// Indian mobile numbers: 10 digits, first digit in [6-9].
/// Ref: project-brief §1.1 and PhoneNumber.cs.
/// </summary>
public class PhoneNumberValueObjectTests
{
    // ──────────────────────────────────────────────────────────────
    // Valid phones
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("6000000000")]
    [InlineData("7999999999")]
    [InlineData("8000000001")]
    [InlineData("9999999999")]
    public void Create_ValidPhone_Succeeds(string phone)
    {
        var result = PhoneNumber.Create(phone);

        result.IsSuccess.Should().BeTrue($"'{phone}' is a valid Indian mobile number");
        result.Value.Value.Should().Be(phone);
    }

    // ──────────────────────────────────────────────────────────────
    // Invalid phones
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("5999999999", "starts with 5 — must start with 6-9")]
    [InlineData("12345",       "too short — 5 digits")]
    [InlineData("12345678901", "too long — 11 digits")]
    [InlineData("",            "empty string")]
    [InlineData(" ",           "whitespace only")]
    public void Create_InvalidPhone_Fails(string phone, string reason)
    {
        var result = PhoneNumber.Create(phone);

        result.IsFailure.Should().BeTrue($"'{phone}' is invalid because: {reason}");
        result.Error.Code.Should().Be("PhoneNumber.Invalid");
    }

    [Fact]
    public void Create_NullPhone_Fails()
    {
        var result = PhoneNumber.Create(null!);

        result.IsFailure.Should().BeTrue("null phone is not a valid Indian mobile number");
    }

    [Theory]
    [InlineData("98765 43210")]
    [InlineData("9876-543210")]
    public void Create_PhoneWithSpacesOrHyphens_Fails(string phone)
    {
        // The value object normalises "+91" prefix but not spaces/hyphens mid-number.
        // Validation regex requires exactly ^[6-9]\d{9}$ after prefix strip.
        var result = PhoneNumber.Create(phone);

        result.IsFailure.Should().BeTrue($"'{phone}' contains formatting characters and must fail validation");
    }

    // ──────────────────────────────────────────────────────────────
    // Equality
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void PhoneNumber_EqualityByValue()
    {
        var a = PhoneNumber.Create("9876543210").Value;
        var b = PhoneNumber.Create("9876543210").Value;

        a.Should().Be(b, "two PhoneNumber VOs with the same number must be equal");
        (a == b).Should().BeTrue("== operator must use value equality");
    }

    [Fact]
    public void PhoneNumber_DifferentValues_AreNotEqual()
    {
        var a = PhoneNumber.Create("9876543210").Value;
        var b = PhoneNumber.Create("9000000001").Value;

        a.Should().NotBe(b);
        (a != b).Should().BeTrue();
    }

    [Fact]
    public void ToE164_PrependsPlusNinetyOne()
    {
        var phone = PhoneNumber.Create("9876543210").Value;

        phone.ToE164().Should().Be("+919876543210");
    }
}
