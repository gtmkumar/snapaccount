using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class UserDevice : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public string DeviceId { get; private set; } = string.Empty;
    public string? DeviceName { get; private set; }
    public string Platform { get; private set; } = string.Empty; // ANDROID, IOS, WEB
    public string? OsVersion { get; private set; }
    public string? AppVersion { get; private set; }
    public string? FcmToken { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime? LastActiveAt { get; private set; }
    public DateTime BoundAt { get; private set; } = DateTime.UtcNow;

    private UserDevice() { }

    internal static UserDevice Create(
        Guid userId,
        string deviceId,
        string? deviceName,
        string platform,
        string? osVersion,
        string? appVersion,
        string? fcmToken)
        => new()
        {
            UserId = userId,
            DeviceId = deviceId,
            DeviceName = deviceName,
            Platform = platform,
            OsVersion = osVersion,
            AppVersion = appVersion,
            FcmToken = fcmToken
        };

    public void UpdateFcmToken(string? fcmToken) => FcmToken = fcmToken;

    public void RecordActivity() => LastActiveAt = DateTime.UtcNow;

    public void Deactivate()
    {
        IsActive = false;
        DeletedAt = DateTime.UtcNow;
    }
}
