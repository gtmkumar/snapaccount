using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// TOTP 2FA enrollment record per user (auth.user_totp).
/// One row per user — uniqueness enforced at DB level (unique constraint on user_id).
/// The TOTP secret is stored ENCRYPTED (AES-256-CBC) — never plaintext.
/// Recovery codes are stored as a JSON array of SHA-256 hex hashes.
/// </summary>
public class UserTotp : BaseAuditableEntity
{
    /// <summary>Foreign key to auth.user.</summary>
    public Guid UserId { get; init; }

    /// <summary>TOTP shared secret, AES-256-CBC encrypted at rest.</summary>
    public string SecretEncrypted { get; set; } = string.Empty;

    /// <summary>True once the user has confirmed a valid TOTP code (enroll confirmed).</summary>
    public bool IsEnabled { get; set; }

    /// <summary>Timestamp when the user confirmed their first valid TOTP code. Null until then.</summary>
    public DateTime? ConfirmedAt { get; set; }

    /// <summary>
    /// JSON array of SHA-256 hex hashes of one-time recovery codes.
    /// Null until 2FA is confirmed. Each code is deleted (set null for the slot) on use.
    /// </summary>
    public string? RecoveryCodes { get; set; }
}
