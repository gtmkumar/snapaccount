using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;
using System.Text;

namespace AuthService.Infrastructure.Services;

public sealed class OtpService(
    AuthDbContext dbContext,
    IConfiguration configuration,
    ILogger<OtpService> logger) : IOtpService
{
    public async Task<Result<Guid>> SendOtpAsync(
        string phoneNumber,
        string otpType = "AUTH",
        string? ipAddress = null,
        string? userAgent = null,
        CancellationToken ct = default)
    {
        // Check for active cooldown
        var activeCooldown = await dbContext.OtpRequests
            .Where(o => o.PhoneNumber == phoneNumber
                        && o.OtpType == otpType
                        && o.CooldownUntil > DateTime.UtcNow
                        && o.DeletedAt == null)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (activeCooldown is not null)
        {
            var waitMinutes = (int)(activeCooldown.CooldownUntil!.Value - DateTime.UtcNow).TotalMinutes + 1;
            return Error.Conflict("Otp.Cooldown",
                $"Too many attempts. Please wait {waitMinutes} minutes before requesting a new OTP.");
        }

        // Generate 6-digit OTP using cryptographically secure RNG (SEC-005)
        var otp = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var otpHash = ComputeSha256Hash($"{phoneNumber}:{otp}");

        var otpRequest = new OtpRequest
        {
            PhoneNumber = phoneNumber,
            OtpHash = otpHash,
            OtpType = otpType,
            ExpiresAt = DateTime.UtcNow.AddMinutes(5),
            IpAddress = ipAddress,
            UserAgent = userAgent
        };
        dbContext.OtpRequests.Add(otpRequest);
        await dbContext.SaveChangesAsync(ct);

        // TODO: Send OTP via MSG91 SMS API
        // For now, log the OTP in non-production environments
        if (configuration["ASPNETCORE_ENVIRONMENT"] != "Production")
            logger.LogWarning("OTP for {Phone}: {Otp} (DEVELOPMENT ONLY — never log in production)", phoneNumber, otp);

        logger.LogInformation("OTP request created for phone {Phone}, type {Type}", phoneNumber, otpType);
        return otpRequest.Id;
    }

    public async Task<Result> VerifyOtpAsync(
        string phoneNumber,
        string otp,
        string otpType = "AUTH",
        CancellationToken ct = default)
    {
        var otpRequest = await dbContext.OtpRequests
            .Where(o => o.PhoneNumber == phoneNumber
                        && o.OtpType == otpType
                        && !o.IsUsed
                        && o.DeletedAt == null)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (otpRequest is null)
            return Result.Failure(Error.NotFound("OtpRequest", $"No active OTP for {phoneNumber}"));

        if (otpRequest.IsOnCooldown)
            return Result.Failure(Error.Conflict("Otp.Cooldown",
                "Account locked due to too many failed attempts. Please wait 30 minutes."));

        if (otpRequest.IsExpired)
            return Result.Failure(Error.Validation("Otp.Expired", "OTP has expired. Please request a new one."));

        var incrementResult = otpRequest.IncrementAttempt();
        if (incrementResult.IsFailure)
        {
            await dbContext.SaveChangesAsync(ct);
            return incrementResult;
        }

        var expectedHash = ComputeSha256Hash($"{phoneNumber}:{otp}");
        if (otpRequest.OtpHash != expectedHash)
        {
            await dbContext.SaveChangesAsync(ct);

            if (otpRequest.IsMaxAttemptsReached)
                return Result.Failure(Error.Conflict("Otp.MaxAttemptsReached",
                    "Maximum OTP attempts reached. Account locked for 30 minutes."));

            var remaining = otpRequest.MaxAttempts - otpRequest.Attempts;
            return Result.Failure(Error.Validation("Otp.Invalid",
                $"Invalid OTP. {remaining} attempt(s) remaining."));
        }

        otpRequest.MarkAsUsed();
        await dbContext.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static string ComputeSha256Hash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
