using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A catalog entry representing a named permission (e.g. <c>gst.returns.file</c>).
///
/// Lifecycle:
///   ACTIVE   — is_active=true,  deleted_at IS NULL   → included everywhere
///   RETIRED  — is_active=false, deleted_at IS NULL   → excluded from matrix / effective perms
///   DELETED  — deleted_at IS NOT NULL                → hard-excluded; EF global filter removes it
///
/// I1.1-001: Both filters apply when querying: <c>p.IsActive AND p.DeletedAt IS NULL</c>.
/// </summary>
public class Permission : BaseAuditableEntity
{
    /// <summary>Unique dot-notation name, e.g. <c>gst.returns.file</c>. Immutable after creation.</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>First dot-segment of <see cref="Name"/>. Immutable after creation.</summary>
    public string Resource { get; private set; } = string.Empty;

    /// <summary>Everything after the first dot in <see cref="Name"/>. Immutable after creation.</summary>
    public string Action { get; private set; } = string.Empty;

    /// <summary>Human-readable description. Mutable via <see cref="UpdateDescription"/>.</summary>
    public string? Description { get; private set; }

    /// <summary>
    /// False = RETIRED. The permission exists in the catalog (visible to SUPER_ADMIN with
    /// <c>includeInactive=true</c>) but is excluded from the role matrix, grantable-permissions,
    /// and effective-permission resolution. Defaults to true on creation.
    /// </summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>FK to the configurable <see cref="ResourceType"/> catalog (gap #3). Nullable
    /// metadata; <see cref="Resource"/> remains the authoritative string for checks.</summary>
    public Guid? ResourceTypeId { get; private set; }

    /// <summary>FK to the configurable <see cref="ActionType"/> catalog (gap #3).</summary>
    public Guid? ActionTypeId { get; private set; }

    private Permission() { }

    /// <summary>Creates a new active catalog permission.</summary>
    public static Permission Create(string name, string resource, string action, string? description = null)
        => new()
        {
            Name        = name,
            Resource    = resource,
            Action      = action,
            Description = description,
            IsActive    = true,
        };

    /// <summary>
    /// Updates the human-readable description. Name/Resource/Action are intentionally
    /// immutable — changing them would silently break every <c>[RequiresPermission]</c>
    /// decoration that references the old value.
    /// </summary>
    public void UpdateDescription(string? description) => Description = description;

    /// <summary>Links this permission to its resource/action type catalog entries (gap #3).</summary>
    public void SetTypes(Guid? resourceTypeId, Guid? actionTypeId)
    {
        ResourceTypeId = resourceTypeId;
        ActionTypeId = actionTypeId;
    }

    /// <summary>
    /// Activates or retires this permission.
    /// RETIRED (IsActive=false) permissions are excluded from the role matrix,
    /// grantable-permissions, and effective-permission resolution.
    /// </summary>
    public void SetActive(bool active) => IsActive = active;
}
