using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A role definition. System roles (IsSystemRole=true) have NULL OrganizationId and are
/// owned by the platform. Custom roles have a non-null OrganizationId and are owned by
/// that org's ORG_ADMIN. Only custom roles may be edited by org admins.
/// </summary>
public class Role : BaseAuditableEntity
{
    /// <summary>Unique machine-readable role name (e.g. "ORG_ADMIN", "CA").</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>Human-readable display name shown in the UI.</summary>
    public string DisplayName { get; private set; } = string.Empty;

    /// <summary>Optional description of what this role can do.</summary>
    public string? Description { get; private set; }

    /// <summary>True for platform-managed roles (SUPER_ADMIN, ORG_ADMIN, CA, etc.). Org admins cannot edit these.</summary>
    public bool IsSystemRole { get; private set; }

    /// <summary>
    /// NULL = system/global role owned by the platform.
    /// Non-NULL = custom role owned by this organization.
    /// </summary>
    public Guid? OrganizationId { get; private set; }

    /// <summary>Provenance: which user created this custom role (null for seeded system roles).</summary>
    public Guid? CreatedByUserId { get; private set; }

    /// <summary>Whether this role is currently active and assignable.</summary>
    public bool IsActive { get; private set; } = true;

    private readonly List<RolePermission> _permissions = [];
    public IReadOnlyCollection<RolePermission> Permissions => _permissions.AsReadOnly();

    private Role() { }

    /// <summary>Creates a platform system role (no org scope).</summary>
    public static Role Create(string name, string displayName, string? description = null, bool isSystemRole = false)
        => new()
        {
            Name = name,
            DisplayName = displayName,
            Description = description,
            IsSystemRole = isSystemRole
        };

    /// <summary>Creates an org-scoped custom role.</summary>
    public static Role CreateOrgRole(
        Guid organizationId,
        Guid createdByUserId,
        string name,
        string displayName,
        string? description = null)
        => new()
        {
            Name = name,
            DisplayName = displayName,
            Description = description,
            IsSystemRole = false,
            OrganizationId = organizationId,
            CreatedByUserId = createdByUserId
        };

    /// <summary>Updates the display name and description of a custom role.</summary>
    public void Update(string displayName, string? description)
    {
        DisplayName = displayName;
        Description = description;
    }

    /// <summary>Soft-deactivates this role so it cannot be assigned to new members.</summary>
    public void Deactivate() => IsActive = false;
}
