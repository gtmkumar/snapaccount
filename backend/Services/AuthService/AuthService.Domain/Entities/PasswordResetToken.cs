using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Single-use, time-boxed password reset token (auth.password_reset_token).
/// The plaintext token is NEVER stored — only the SHA-256 hex hash.
/// Token expires after 1 hour. Consumed via <c>used_at</c>.
/// </summary>
public class PasswordResetToken : BaseAuditableEntity
{
    /// <summary>Foreign key to auth.user.</summary>
    public Guid UserId { get; init; }

    /// <summary>SHA-256 hex hash of the 32-byte random token. Never store plaintext.</summary>
    public string TokenHash { get; init; } = string.Empty;

    /// <summary>UTC expiry (now + 1 hour on creation).</summary>
    public DateTime ExpiresAt { get; init; }

    /// <summary>Set when the token is consumed (single-use enforcement).</summary>
    public DateTime? UsedAt { get; set; }

    /// <summary>True if this token is still valid (not expired and not used).</summary>
    public bool IsValid => UsedAt is null && DateTime.UtcNow < ExpiresAt && DeletedAt is null;
}
