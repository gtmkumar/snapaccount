using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

/// <summary>
/// GAP-047: Published when a new-device login creates a <c>DeviceApprovalRequest</c>.
/// Consumed by NotificationService (Pub/Sub topic: <c>device-approval-requests</c>) to push
/// a notification to the user's existing registered devices.
///
/// Payload design: includes enough metadata for the push message text and for the mobile
/// approval screen to render without an additional API call.
/// Device-exclusion metadata: <see cref="NewDeviceId"/> identifies the device to EXCLUDE
/// from the push target list (don't send the approval request to the device that needs approval).
/// </summary>
public record DeviceApprovalRequestedEvent(
    Guid UserId,
    Guid ApprovalRequestId,
    /// <summary>Entity ID of the new UserDevice — exclude this device from push targets.</summary>
    Guid NewDeviceId,
    /// <summary>Platform-level device identifier string (for display in the notification).</summary>
    string NewDeviceIdentifier,
    string NewDeviceName,
    string NewDevicePlatform,
    DateTime ExpiresAt) : DomainEvent;
