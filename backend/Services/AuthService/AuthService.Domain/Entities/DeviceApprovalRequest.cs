using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// GAP-047: Pending approval request created when a user logs in on a new device.
/// An existing registered device must approve or deny the new device within <see cref="ExpiresAt"/>.
///
/// Soft-launch: <c>DeviceApproval:Enforce</c> config flag (default false) controls whether
/// a denied request blocks the new session (enforced) or only logs and notifies (monitoring mode).
///
/// Approval/denial transitions are final — once <see cref="Status"/> is set to
/// <see cref="DeviceApprovalStatus.Approved"/> or <see cref="DeviceApprovalStatus.Denied"/>,
/// the row is immutable from the domain perspective.
/// </summary>
public class DeviceApprovalRequest : BaseAuditableEntity
{
    /// <summary>User who triggered the new-device login.</summary>
    public Guid UserId { get; private set; }

    /// <summary>The new device entity being approved (FK → auth.user_device).</summary>
    public Guid NewDeviceId { get; private set; }

    /// <summary>Platform-level device ID string (for display in the approval push notification).</summary>
    public string NewDeviceIdentifier { get; private set; } = string.Empty;

    /// <summary>Human-readable name of the new device (from the login request).</summary>
    public string? NewDeviceName { get; private set; }

    /// <summary>Platform of the new device (ANDROID, IOS, WEB).</summary>
    public string NewDevicePlatform { get; private set; } = string.Empty;

    /// <summary>UTC expiry — default 10 minutes from creation.</summary>
    public DateTime ExpiresAt { get; private set; }

    /// <summary>Current status of the approval request.</summary>
    public DeviceApprovalStatus Status { get; private set; } = DeviceApprovalStatus.Pending;

    /// <summary>
    /// User entity ID of the device that performed the approval/denial action.
    /// Null until the request is resolved.
    /// </summary>
    public Guid? ReviewedByDeviceId { get; private set; }

    /// <summary>UTC timestamp when the request was approved or denied.</summary>
    public DateTime? ReviewedAt { get; private set; }

    /// <summary>Optional reason supplied when denying (surfaced in the blocked-session error).</summary>
    public string? DenialReason { get; private set; }

    /// <summary>Session/refresh token ID to revoke when denied (links back to the pending session).</summary>
    public Guid? NewDeviceSessionTokenId { get; private set; }

    private DeviceApprovalRequest() { }

    /// <summary>Creates a new pending device approval request (10-min expiry).</summary>
    public static DeviceApprovalRequest Create(
        Guid userId,
        Guid newDeviceId,
        string newDeviceIdentifier,
        string? newDeviceName,
        string newDevicePlatform,
        Guid? newDeviceSessionTokenId = null,
        int expiryMinutes = 10)
        => new()
        {
            UserId = userId,
            NewDeviceId = newDeviceId,
            NewDeviceIdentifier = newDeviceIdentifier,
            NewDeviceName = newDeviceName,
            NewDevicePlatform = newDevicePlatform,
            NewDeviceSessionTokenId = newDeviceSessionTokenId,
            ExpiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes)
        };

    /// <summary>Returns true when the request is still within the expiry window.</summary>
    public bool IsActive => Status == DeviceApprovalStatus.Pending && DateTime.UtcNow < ExpiresAt;

    /// <summary>
    /// Approves the new device from a different registered device.
    /// </summary>
    /// <param name="reviewingDeviceId">Entity ID of the device performing the approval.</param>
    public Result Approve(Guid reviewingDeviceId)
    {
        if (!IsActive)
            return Result.Failure(Error.Conflict("DeviceApproval.Expired",
                "The device approval request has expired or already been resolved."));

        Status = DeviceApprovalStatus.Approved;
        ReviewedByDeviceId = reviewingDeviceId;
        ReviewedAt = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// Denies the new device from a different registered device.
    /// </summary>
    /// <param name="reviewingDeviceId">Entity ID of the device performing the denial.</param>
    /// <param name="reason">Optional reason for denial.</param>
    public Result Deny(Guid reviewingDeviceId, string? reason = null)
    {
        if (!IsActive)
            return Result.Failure(Error.Conflict("DeviceApproval.Expired",
                "The device approval request has expired or already been resolved."));

        Status = DeviceApprovalStatus.Denied;
        ReviewedByDeviceId = reviewingDeviceId;
        ReviewedAt = DateTime.UtcNow;
        DenialReason = reason;
        return Result.Success();
    }
}

/// <summary>Status of a device approval request.</summary>
public enum DeviceApprovalStatus
{
    /// <summary>Awaiting approval from an existing device.</summary>
    Pending,
    /// <summary>Existing device approved the new login.</summary>
    Approved,
    /// <summary>Existing device denied the new login — new device session revoked.</summary>
    Denied,
    /// <summary>10-minute window expired before a decision was made.</summary>
    Expired
}
