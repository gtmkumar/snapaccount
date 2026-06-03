using System.Security.Cryptography;
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

/// <summary>
/// Response returned after successful OTP verification.
/// <para><c>RefreshToken</c> is a 64-byte random opaque string (base64). Store it securely
/// (Expo SecureStore / Android Keystore) and exchange via POST /auth/token/refresh.
/// <c>RefreshExpiresAt</c> is UTC ISO-8601.</para>
/// </summary>
public record VerifyOtpResponse(
    bool IsNewUser,
    string? FirebaseCustomToken,
    Guid UserId,
    string? RefreshToken = null,
    DateTime? RefreshExpiresAt = null);

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
/// finds or creates the <see cref="User"/> aggregate, issues a Firebase custom token,
/// and persists an initial refresh token so clients can call /auth/token/refresh immediately.
/// </summary>
public sealed class VerifyOtpCommandHandler(
    IOtpService otpService,
    IUserRepository userRepository,
    IFirebaseAuthService firebaseAuthService,
    IRefreshTokenRepository refreshTokenRepository)
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

        // Issue initial refresh token — same generation pattern as RefreshTokenCommandHandler.
        // 64 random bytes → base64 plaintext returned to caller; SHA-256 hex stored in DB.
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenPlain = Convert.ToBase64String(tokenBytes);
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tokenPlain)));

        // DeviceId: parse command string → Guid? (null if absent or not a valid Guid)
        Guid? deviceId = Guid.TryParse(request.DeviceId, out var parsedDevice)
            ? parsedDevice
            : null;

        var refreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            DeviceId = deviceId,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);

        return new VerifyOtpResponse(
            isNewUser,
            customTokenResult.Value,
            user.Id,
            tokenPlain,
            refreshToken.ExpiresAt);
    }
}
