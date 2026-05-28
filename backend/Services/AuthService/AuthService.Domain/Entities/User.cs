using SnapAccount.Shared.Domain;
using AuthService.Domain.Events;

namespace AuthService.Domain.Entities;

public class User : BaseAuditableEntity
{
    public string? FirebaseUid { get; private set; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; set; }
    public string? FullName { get; set; }
    public bool IsPhoneVerified { get; private set; }
    public bool IsEmailVerified { get; private set; }
    public bool IsActive { get; private set; } = true;
    public bool IsDeleted { get; private set; }
    public string PreferredLanguage { get; set; } = "en";
    public DateTime? LastLoginAt { get; set; }

    /// <summary>
    /// PBKDF2 password hash for LOCAL_AUTH dev login. Null for Firebase-authenticated users;
    /// never populated or used in staging/production.
    /// </summary>
    public string? PasswordHash { get; private set; }

    public void SetPasswordHash(string hash) => PasswordHash = hash;

    private readonly List<UserDevice> _devices = [];
    public IReadOnlyCollection<UserDevice> Devices => _devices.AsReadOnly();

    private readonly List<UserRole> _roles = [];
    public IReadOnlyCollection<UserRole> Roles => _roles.AsReadOnly();

    public UserProfile? Profile { get; private set; }
    public UserPreference? Preference { get; private set; }

    /// <summary>
    /// Links the Firebase UID and marks the phone number as verified.
    /// These two fields are always set together — callers must not bypass this coupling.
    /// </summary>
    public Result LinkFirebaseUid(string firebaseUid)
    {
        FirebaseUid = firebaseUid;
        IsPhoneVerified = true;
        return Result.Success();
    }

    /// <summary>
    /// Associates a new <see cref="UserProfile"/> with this user.
    /// Called when no profile exists yet (first profile update).
    /// </summary>
    public void SetProfile(UserProfile profile) => Profile = profile;

    public Result AddDevice(string deviceId, string deviceName, string platform, string? osVersion, string? appVersion, string? fcmToken)
    {
        var activeDeviceCount = _devices.Count(d => d.IsActive && d.DeletedAt == null);
        if (activeDeviceCount >= 2)
            return Result.Failure(Error.Conflict("User.MaxDevicesReached",
                "Maximum 2 active devices are allowed per account."));

        if (_devices.Any(d => d.DeviceId == deviceId && d.DeletedAt == null))
            return Result.Failure(Error.Conflict("User.DeviceAlreadyBound",
                "This device is already bound to the account."));

        var device = UserDevice.Create(Id, deviceId, deviceName, platform, osVersion, appVersion, fcmToken);
        _devices.Add(device);
        AddDomainEvent(new DeviceAddedEvent(Id, device.Id, deviceId, platform));
        return Result.Success();
    }

    public Result RemoveDevice(Guid deviceId)
    {
        var device = _devices.FirstOrDefault(d => d.Id == deviceId && d.DeletedAt == null);
        if (device is null)
            return Result.Failure(Error.NotFound("UserDevice", deviceId));

        device.Deactivate();
        return Result.Success();
    }

    public Result RequestAccountDeletion()
    {
        // DPDP Act 2023 — Right to Erasure
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
        IsActive = false;
        AddDomainEvent(new AccountDeletionRequestedEvent(Id, PhoneNumber ?? string.Empty));
        return Result.Success();
    }
}
