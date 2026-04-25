using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class RefreshToken : BaseAuditableEntity
{
    public Guid UserId { get; init; }
    public Guid? DeviceId { get; init; }
    public string TokenHash { get; init; } = string.Empty; // SHA-256 hash
    public bool IsRevoked { get; private set; }
    public DateTime? RevokedAt { get; private set; }
    public string? RevokedReason { get; private set; }
    public DateTime ExpiresAt { get; init; } // 30 days
    public DateTime? LastUsedAt { get; private set; }

    public bool IsExpired => DateTime.UtcNow > ExpiresAt;

    public bool IsValid => !IsRevoked && !IsExpired && DeletedAt == null;

    public void Use() => LastUsedAt = DateTime.UtcNow;

    public void Revoke(string reason = "Token rotated")
    {
        IsRevoked = true;
        RevokedAt = DateTime.UtcNow;
        RevokedReason = reason;
    }
}
