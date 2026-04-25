using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Otp.Commands.VerifyOtp;

/// <summary>Verifies the OTP sent to a phone number and issues a Firebase custom token.</summary>
/// <param name="PhoneNumber">Indian mobile number that received the OTP.</param>
/// <param name="Otp">6-digit OTP.</param>
/// <param name="DeviceId">Optional — device to associate with the session.</param>
public record VerifyOtpCommand(string PhoneNumber, string Otp, string? DeviceId = null)
    : ICommand<VerifyOtpResponse>;

/// <summary>Response returned after successful OTP verification.</summary>
public record VerifyOtpResponse(bool IsNewUser, string? FirebaseCustomToken, Guid UserId);

/// <summary>FluentValidation validator for <see cref="VerifyOtpCommand"/>.</summary>
public sealed class VerifyOtpCommandValidator : AbstractValidator<VerifyOtpCommand>
{
    public VerifyOtpCommandValidator()
    {
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^[6-9]\d{9}$")
            .WithMessage("Must be a valid Indian mobile number.");

        RuleFor(x => x.Otp)
            .NotEmpty()
            .Length(6).WithMessage("OTP must be exactly 6 digits.")
            .Matches(@"^\d{6}$").WithMessage("OTP must contain only digits.");
    }
}

/// <summary>
/// Verifies the OTP (enforcing 3-attempt limit + 30-min lockout via <see cref="IOtpService"/>),
/// finds or creates the <see cref="User"/> aggregate, and issues a Firebase custom token.
/// </summary>
public sealed class VerifyOtpCommandHandler(
    IOtpService otpService,
    IUserRepository userRepository,
    IFirebaseAuthService firebaseAuthService)
    : ICommandHandler<VerifyOtpCommand, VerifyOtpResponse>
{
    /// <inheritdoc />
    public async Task<Result<VerifyOtpResponse>> Handle(
        VerifyOtpCommand request,
        CancellationToken cancellationToken)
    {
        // Verify OTP — enforces 3-attempt limit + 30-min lockout
        var verifyResult = await otpService.VerifyOtpAsync(
            request.PhoneNumber, request.Otp, ct: cancellationToken);
        if (verifyResult.IsFailure)
            return verifyResult.Error;

        // Get or create user
        var user = await userRepository.GetByPhoneNumberAsync(request.PhoneNumber, cancellationToken);
        var isNewUser = user is null;

        if (isNewUser)
        {
            user = new User { PhoneNumber = request.PhoneNumber };
            user.AddDomainEvent(new UserRegisteredEvent(user.Id, request.PhoneNumber));
            user = await userRepository.AddAsync(user, cancellationToken);
        }

        var firebaseUid = user!.FirebaseUid ?? $"phone_{request.PhoneNumber}";
        var customTokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            firebaseUid,
            new Dictionary<string, object>
            {
                ["userId"] = user.Id.ToString(),
                ["phoneNumber"] = request.PhoneNumber
            },
            cancellationToken);

        if (customTokenResult.IsFailure)
            return customTokenResult.Error;

        user.LastLoginAt = DateTime.UtcNow;
        await userRepository.UpdateAsync(user, cancellationToken);

        return new VerifyOtpResponse(isNewUser, customTokenResult.Value, user.Id);
    }
}
