using AuthService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Otp.Commands.SendOtp;

/// <summary>Sends a one-time password to the specified Indian mobile number.</summary>
/// <param name="PhoneNumber">Target phone number (Indian format: 6-9 prefix, 10 digits).</param>
/// <param name="OtpType">AUTH, KYC_AADHAAR, or PASSWORD_RESET.</param>
/// <param name="IpAddress">Client IP for audit logging.</param>
/// <param name="UserAgent">Client user-agent for audit logging.</param>
public record SendOtpCommand(
    string PhoneNumber,
    string OtpType = "AUTH",
    string? IpAddress = null,
    string? UserAgent = null) : ICommand<SendOtpResponse>;

/// <summary>Response returned after the OTP is dispatched.</summary>
public record SendOtpResponse(Guid OtpRequestId, string Message);

/// <summary>
/// FluentValidation validator for <see cref="SendOtpCommand"/>.
/// SEC-011: This endpoint is rate-limited to 5 req/10 min per IP at the API layer.
/// </summary>
public sealed class SendOtpCommandValidator : AbstractValidator<SendOtpCommand>
{
    public SendOtpCommandValidator()
    {
        RuleFor(x => x.PhoneNumber)
            .NotEmpty().WithMessage("Phone number is required.")
            .Matches(@"^[6-9]\d{9}$")
            .WithMessage("Must be a valid Indian mobile number (starts 6-9, 10 digits).");

        RuleFor(x => x.OtpType)
            .Must(t => t is "AUTH" or "KYC_AADHAAR" or "PASSWORD_RESET")
            .WithMessage("OTP type must be AUTH, KYC_AADHAAR, or PASSWORD_RESET.");
    }
}

/// <summary>
/// Delegates OTP dispatch to <see cref="IOtpService"/> (MSG91 in production).
/// </summary>
public sealed class SendOtpCommandHandler(IOtpService otpService)
    : ICommandHandler<SendOtpCommand, SendOtpResponse>
{
    /// <inheritdoc />
    public async Task<Result<SendOtpResponse>> Handle(
        SendOtpCommand request,
        CancellationToken cancellationToken)
    {
        var result = await otpService.SendOtpAsync(
            request.PhoneNumber,
            request.OtpType,
            request.IpAddress,
            request.UserAgent,
            cancellationToken);

        if (result.IsFailure)
            return result.Error;

        return new SendOtpResponse(result.Value, "OTP sent successfully.");
    }
}
