using SnapAccount.Shared.Domain;

namespace NotificationService.Domain.Entities;

/// <summary>
/// FCM push token registered by a mobile device.
/// Tokens rotate on app refresh — the most recent token per device is used.
/// </summary>
public class PushToken : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public string DeviceId { get; private set; } = string.Empty;
    public string Token { get; private set; } = string.Empty;
    public string Platform { get; private set; } = string.Empty; // ios, android
    public bool IsActive { get; private set; } = true;

    private PushToken() { }

    /// <summary>Registers or refreshes a push token for a device.</summary>
    public static PushToken Create(Guid userId, string deviceId, string token, string platform)
        => new() { UserId = userId, DeviceId = deviceId, Token = token, Platform = platform };

    /// <summary>Deactivates this token (stale or explicitly revoked).</summary>
    public void Deactivate() => IsActive = false;
}
