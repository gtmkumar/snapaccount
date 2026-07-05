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
    IOtpSmsSender smsSender,
    ILogger<OtpService> logger) : IOtpService
{
    // DG-AUTH-07: OTP limits read from config (Auth:Otp section); hardcoded literals removed.
    // Defaults match the previously hardcoded values so existing behaviour is preserved when
    // the config section is absent (backwards-compatible).
    private int OtpValidityMinutes  => configuration.GetValue<int?>("Auth:Otp:ValidityMinutes")  ?? 5;
    private int OtpMaxAttempts      => configuration.GetValue<int?>("Auth:Otp:MaxAttempts")      ?? 3;
    private int OtpCooldownMinutes  => configuration.GetValue<int?>("Auth:Otp:CooldownMinutes")  ?? 30;

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

        // Generate 6-digit OTP using cryptographically secure RNG (SEC-005).
        // Dev convenience: outside Production use a fixed "123456" so manual/automated
        // testing needs no SMS and no DB/hash lookup. Production ALWAYS uses secure RNG.
        var isProduction = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Production", StringComparison.OrdinalIgnoreCase);
        var otp = isProduction
            ? RandomNumberGenerator.GetInt32(100000, 1000000).ToString()
            : "123456";
        var otpHash = ComputeSha256Hash($"{phoneNumber}:{otp}");

        // DG-AUTH-07: validity, maxAttempts, and cooldown are now config-driven.
        var otpRequest = new OtpRequest
        {
            PhoneNumber = phoneNumber,
            OtpHash     = otpHash,
            OtpType     = otpType,
            ExpiresAt   = DateTime.UtcNow.AddMinutes(OtpValidityMinutes),
            IpAddress   = ipAddress,
            UserAgent   = userAgent
        };
        otpRequest.SetLimits(OtpMaxAttempts, OtpCooldownMinutes);
        dbContext.OtpRequests.Add(otpRequest);
        await dbContext.SaveChangesAsync(ct);

        // Dev convenience: log the OTP in non-prod so manual testing doesn't need a phone.
        // In prod this branch is skipped — the OTP only ever leaves the box via MSG91.
        var env = configuration["ASPNETCORE_ENVIRONMENT"];
        if (!string.Equals(env, "Production", StringComparison.OrdinalIgnoreCase))
            logger.LogWarning("OTP for {Phone}: {Otp} (DEVELOPMENT ONLY — never log in production)", phoneNumber, otp);

        // Send via MSG91 OTP API. Failures are logged but not propagated — the
        // OTP row is already persisted, so the user can be told to retry on
        // the next SendOtp call. Production must be alerted on the
        // sms-delivery-failure-rate metric.
        var delivered = await smsSender.SendOtpAsync(phoneNumber, otp, ct);
        if (!delivered)
            logger.LogError("OTP request {OtpId} created but SMS delivery failed for {Phone}",
                otpRequest.Id, phoneNumber);

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
