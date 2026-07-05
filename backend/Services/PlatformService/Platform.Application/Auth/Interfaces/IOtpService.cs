using SnapAccount.Shared.Domain;

namespace AuthService.Application.Interfaces;

public interface IOtpService
{
    /// <summary>Generates a 6-digit OTP, stores SHA256 hash, sends via MSG91, returns OtpRequest id.</summary>
    Task<Result<Guid>> SendOtpAsync(string phoneNumber, string otpType = "AUTH",
        string? ipAddress = null, string? userAgent = null, CancellationToken ct = default);

    /// <summary>Verifies OTP. Enforces 3-attempt limit and 30-minute lockout.</summary>
    Task<Result> VerifyOtpAsync(string phoneNumber, string otp, string otpType = "AUTH",
        CancellationToken ct = default);
}
