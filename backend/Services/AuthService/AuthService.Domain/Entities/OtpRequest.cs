using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class OtpRequest : BaseAuditableEntity
{
    public string PhoneNumber { get; init; } = string.Empty;
    public string OtpType { get; init; } = "AUTH"; // AUTH, KYC_AADHAAR, PASSWORD_RESET
    public string OtpHash { get; init; } = string.Empty; // SHA256 hash — never store plain
    public int Attempts { get; private set; }
    public int MaxAttempts { get; private set; } = 3;
    public bool IsUsed { get; private set; }
    public DateTime ExpiresAt { get; init; } // 5 minutes from creation
    public DateTime? CooldownUntil { get; private set; } // 30-min cooldown after max attempts
    public string? IpAddress { get; init; }
    public string? UserAgent { get; init; }

    public bool IsExpired => DateTime.UtcNow > ExpiresAt;

    public bool IsOnCooldown => CooldownUntil.HasValue && DateTime.UtcNow < CooldownUntil;

    public bool IsMaxAttemptsReached => Attempts >= MaxAttempts;

    public Result IncrementAttempt()
    {
        if (IsUsed)
            return Result.Failure(Error.Conflict("Otp.AlreadyUsed", "This OTP has already been used."));

        if (IsExpired)
            return Result.Failure(Error.Validation("Otp.Expired", "OTP has expired. Please request a new one."));

        Attempts++;

        if (Attempts >= MaxAttempts)
            CooldownUntil = DateTime.UtcNow.AddMinutes(30);

        return Result.Success();
    }

    public void MarkAsUsed() => IsUsed = true;
}
