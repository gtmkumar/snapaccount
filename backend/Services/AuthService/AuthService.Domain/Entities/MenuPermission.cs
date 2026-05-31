using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Maps a <see cref="NavigationItem"/> to a permission that reveals it. A menu with
/// no mappings is visible to all authenticated users; with mappings, it is shown
/// when the user's effective permissions intersect them (OR semantics; the "*"
/// wildcard matches all). Stored in <c>auth.menu_permission</c> (migration 042).
/// </summary>
public class MenuPermission : BaseAuditableEntity
{
    /// <summary>The navigation item being gated.</summary>
    public Guid MenuId { get; private set; }

    /// <summary>The permission that grants visibility of the item.</summary>
    public Guid PermissionId { get; private set; }

    /// <summary>
    /// Reserved for AND-group semantics. Currently every mapping is treated as one
    /// of an OR set; kept so a future "all required" mode can be expressed in data.
    /// </summary>
    public bool IsRequired { get; private set; } = true;

    public Permission? Permission { get; private set; }

    private MenuPermission() { }

    public static MenuPermission Create(Guid menuId, Guid permissionId, bool isRequired = true)
        => new() { MenuId = menuId, PermissionId = permissionId, IsRequired = isRequired };
}
