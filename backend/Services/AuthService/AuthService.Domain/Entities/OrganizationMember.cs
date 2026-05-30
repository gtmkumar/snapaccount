using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class OrganizationMember : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid UserId { get; private set; }
    public Guid RoleId { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime JoinedAt { get; private set; } = DateTime.UtcNow;

    private OrganizationMember() { }

    public static OrganizationMember Create(Guid organizationId, Guid userId, Guid roleId)
        => new()
        {
            OrganizationId = organizationId,
            UserId = userId,
            RoleId = roleId
        };

    /// <summary>Reassigns this member to a different role.</summary>
    public void AssignRole(Guid newRoleId) => RoleId = newRoleId;

    /// <summary>Reactivates a previously suspended member.</summary>
    public void Reactivate() => IsActive = true;

    public void Deactivate() => IsActive = false;
}
