using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Telemetry record for a device integrity attestation check.
/// Stored in <c>auth.device_integrity_checks</c>.
/// Every call to an integrity-gated endpoint (OTP send/verify, login, high-risk loan) is recorded
/// regardless of verdict so security teams can monitor bot/emulator attack patterns.
/// Migration 089.
/// </summary>
public sealed class DeviceIntegrityCheck : BaseAuditableEntity
{
    /// <summary>User ID if the request was authenticated; null for anonymous OTP-send calls.</summary>
    public Guid? UserId { get; private set; }

    /// <summary>Organisation ID if the request carried an org claim.</summary>
    public Guid? OrganizationId { get; private set; }

    /// <summary>Platform declared by the client: ANDROID, IOS, or null when header absent.</summary>
    public string? Platform { get; private set; }

    /// <summary>Attestation verdict: PASS, FAIL, SKIPPED, or NOT_CONFIGURED.</summary>
    public string Verdict { get; private set; } = default!;

    /// <summary>Endpoint path that triggered the check (e.g. /auth/otp/send).</summary>
    public string Endpoint { get; private set; } = default!;

    /// <summary>
    /// Structured reason for a FAIL or NOT_CONFIGURED verdict — provider-specific detail.
    /// Null on PASS/SKIPPED.
    /// </summary>
    public string? FailureReason { get; private set; }

    /// <summary>Client IP — included for abuse-pattern analysis.</summary>
    public string? ClientIp { get; private set; }

    /// <summary>Recorded at UTC timestamp — matches <c>created_at</c>.</summary>
    public DateTime RecordedAt { get; private set; }

    // EF constructor
    private DeviceIntegrityCheck() { }

    /// <summary>
    /// Factory method — creates a telemetry record for one integrity check.
    /// </summary>
    public static DeviceIntegrityCheck Record(
        string verdict,
        string endpoint,
        string? platform,
        Guid? userId = null,
        Guid? organizationId = null,
        string? failureReason = null,
        string? clientIp = null)
    {
        return new DeviceIntegrityCheck
        {
            Id = Guid.NewGuid(),
            Verdict = verdict,
            Endpoint = endpoint,
            Platform = platform,
            UserId = userId,
            OrganizationId = organizationId,
            FailureReason = failureReason,
            ClientIp = clientIp,
            RecordedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
