using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Represents a pending (or historical) invitation for a user to join an organization with a given role.
/// Tokens are stored as SHA-256 hashes — the raw token is only returned to the caller on creation.
/// </summary>
public class Invitation : BaseAuditableEntity
{
    /// <summary>Organization this invitation belongs to.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>Email address to which the invitation was sent.</summary>
    public string Email { get; private set; } = string.Empty;

    /// <summary>Optional phone number for SMS delivery.</summary>
    public string? PhoneNumber { get; private set; }

    /// <summary>Role to be assigned when the invitation is accepted.</summary>
    public Guid RoleId { get; private set; }

    /// <summary>User who sent this invitation.</summary>
    public Guid InvitedByUserId { get; private set; }

    /// <summary>SHA-256 hash of the raw invite token (unique). Never store the raw token. VARCHAR(256).</summary>
    public string TokenHash { get; private set; } = string.Empty;

    /// <summary>Current status of the invitation.</summary>
    public InvitationStatus Status { get; private set; } = InvitationStatus.Pending;

    /// <summary>When the invitation expires (typically 48 hours after creation).</summary>
    public DateTime ExpiresAt { get; private set; }

    /// <summary>When the invitation was accepted (null until accepted).</summary>
    public DateTime? AcceptedAt { get; private set; }

    /// <summary>The user who accepted the invitation (linked on acceptance).</summary>
    public Guid? AcceptedUserId { get; private set; }

    // Navigation properties
    public Organization? Organization { get; private set; }
    public Role? Role { get; private set; }

    private Invitation() { }

    /// <summary>Creates a new pending invitation.</summary>
    public static Invitation Create(
        Guid organizationId,
        string email,
        string? phoneNumber,
        Guid roleId,
        Guid invitedByUserId,
        string tokenHash,
        DateTime expiresAt)
        => new()
        {
            OrganizationId = organizationId,
            Email = email.ToLowerInvariant().Trim(),
            PhoneNumber = phoneNumber,
            RoleId = roleId,
            InvitedByUserId = invitedByUserId,
            TokenHash = tokenHash,
            Status = InvitationStatus.Pending,
            ExpiresAt = expiresAt
        };

    /// <summary>Marks this invitation as accepted by the given user.</summary>
    public void Accept(Guid acceptedUserId)
    {
        Status = InvitationStatus.Accepted;
        AcceptedAt = DateTime.UtcNow;
        AcceptedUserId = acceptedUserId;
    }

    /// <summary>Revokes the invitation (e.g. admin cancelled it before acceptance).</summary>
    public void Revoke() => Status = InvitationStatus.Revoked;

    /// <summary>Marks the invitation as expired (called when acceptance is attempted after expiry).</summary>
    public void MarkExpired() => Status = InvitationStatus.Expired;

    /// <summary>Returns true if the invitation is usable (pending and not expired).</summary>
    public bool IsValid(DateTime utcNow) =>
        Status == InvitationStatus.Pending && ExpiresAt > utcNow;
}

/// <summary>Lifecycle states for an <see cref="Invitation"/>.</summary>
public enum InvitationStatus
{
    Pending = 0,
    Accepted = 1,
    Revoked = 2,
    Expired = 3
}
