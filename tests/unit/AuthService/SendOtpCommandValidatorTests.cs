using AuthService.Application.Otp.Commands.SendOtp;
using FluentAssertions;
using FluentValidation.TestHelper;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests for SendOtpCommandValidator.
/// Validates that the MediatR command validator rejects bad phone numbers
/// before any infrastructure is touched.
/// </summary>
public class SendOtpCommandValidatorTests
{
    private readonly SendOtpCommandValidator _validator = new();

    // ──────────────────────────────────────────────────────────────
    // Valid phone
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("9876543210")]
    [InlineData("6000000000")]
    [InlineData("8123456789")]
    [InlineData("7999999999")]
    public void ValidIndianPhone_PassesValidation(string phone)
    {
        var command = new SendOtpCommand(phone);
        var result = _validator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.PhoneNumber);
    }

    // ──────────────────────────────────────────────────────────────
    // Invalid phone
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("5876543210", "starts with 5")]
    [InlineData("4876543210", "starts with 4")]
    [InlineData("987654321",  "9 digits — too short")]
    [InlineData("98765432101","11 digits — too long")]
    [InlineData("0987654321", "starts with 0")]
    [InlineData("1234567890", "starts with 1")]
    public void InvalidPhone_FailsValidationWithMessage(string phone, string reason)
    {
        var command = new SendOtpCommand(phone);
        var result = _validator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.PhoneNumber)
            .WithErrorMessage("Must be a valid Indian mobile number (starts 6-9, 10 digits).");
    }

    // ──────────────────────────────────────────────────────────────
    // Missing phone
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void MissingPhone_FailsWithRequiredMessage()
    {
        var command = new SendOtpCommand(string.Empty);
        var result = _validator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.PhoneNumber)
            .WithErrorMessage("Phone number is required.");
    }

    // ──────────────────────────────────────────────────────────────
    // OTP type validation
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("AUTH")]
    [InlineData("KYC_AADHAAR")]
    [InlineData("PASSWORD_RESET")]
    public void ValidOtpType_PassesValidation(string otpType)
    {
        var command = new SendOtpCommand("9876543210", otpType);
        var result = _validator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.OtpType);
    }

    [Fact]
    public void InvalidOtpType_FailsValidation()
    {
        var command = new SendOtpCommand("9876543210", "UNKNOWN_TYPE");
        var result = _validator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.OtpType)
            .WithErrorMessage("OTP type must be AUTH, KYC_AADHAAR, or PASSWORD_RESET.");
    }
}
