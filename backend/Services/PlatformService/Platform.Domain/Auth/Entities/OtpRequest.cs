using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class OtpRequest : BaseAuditableEntity
{
    public string PhoneNumber { get; init; } = string.Empty;
    public string OtpType { get; init; } = "AUTH"; // AUTH, KYC_AADHAAR, PASSWORD_RESET
    public string OtpHash { get; init; } = string.Empty; // SHA256 hash — never store plain
    public int Attempts { get; private set; }

    /// <summary>
    /// Maximum allowed verify attempts before a cooldown is triggered.
    /// DG-AUTH-07: populated from config (Auth:Otp:MaxAttempts) by <c>OtpService</c> via
    /// <see cref="SetLimits"/>; defaults to 3 for EF hydration and unit tests.
    /// </summary>
    public int MaxAttempts { get; private set; } = 3;

    /// <summary>
    /// Cooldown duration in minutes applied when <see cref="MaxAttempts"/> is reached.
    /// DG-AUTH-07: populated from config (Auth:Otp:CooldownMinutes) via <see cref="SetLimits"/>;
    /// defaults to 30 for EF hydration and unit tests.
    /// </summary>
    public int CooldownMinutes { get; private set; } = 30;

    public bool IsUsed { get; private set; }
    public DateTime ExpiresAt { get; init; } // configured validity (default 5 minutes) from creation
    public DateTime? CooldownUntil { get; private set; } // cooldown after max attempts
    public string? IpAddress { get; init; }
    public string? UserAgent { get; init; }

    public bool IsExpired => DateTime.UtcNow > ExpiresAt;

    public bool IsOnCooldown => CooldownUntil.HasValue && DateTime.UtcNow < CooldownUntil;

    public bool IsMaxAttemptsReached => Attempts >= MaxAttempts;

    /// <summary>
    /// DG-AUTH-07: Applies config-driven limits (maxAttempts, cooldownMinutes) to this OTP request.
    /// Called by <c>OtpService</c> immediately after construction, before EF add.
    /// Values default to the legacy hardcoded constants (3 / 30) when not called,
    /// so EF-hydrated rows and unit tests that construct directly continue to work.
    /// </summary>
    public void SetLimits(int maxAttempts, int cooldownMinutes)
    {
        MaxAttempts    = maxAttempts    > 0 ? maxAttempts    : 3;
        CooldownMinutes = cooldownMinutes > 0 ? cooldownMinutes : 30;
    }

    public Result IncrementAttempt()
    {
        if (IsUsed)
            return Result.Failure(Error.Conflict("Otp.AlreadyUsed", "This OTP has already been used."));

        if (IsExpired)
            return Result.Failure(Error.Validation("Otp.Expired", "OTP has expired. Please request a new one."));

        Attempts++;

        // DG-AUTH-07: cooldown duration is now config-driven via CooldownMinutes.
        if (Attempts >= MaxAttempts)
            CooldownUntil = DateTime.UtcNow.AddMinutes(CooldownMinutes);

        return Result.Success();
    }

    public void MarkAsUsed() => IsUsed = true;
}
