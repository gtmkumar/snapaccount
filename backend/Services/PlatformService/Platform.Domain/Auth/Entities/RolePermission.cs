using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class RolePermission : BaseAuditableEntity
{
    public Guid RoleId { get; private set; }
    public Guid PermissionId { get; private set; }

    /// <summary>
    /// TRUE = grant (allow); FALSE = explicit deny. Deny wins over any allow when
    /// effective permissions are resolved (migration 043, gap #2).
    /// </summary>
    public bool IsAllowed { get; private set; } = true;

    public Role? Role { get; private set; }
    public Permission? Permission { get; private set; }

    private RolePermission() { }

    public static RolePermission Create(Guid roleId, Guid permissionId, bool isAllowed = true)
        => new() { RoleId = roleId, PermissionId = permissionId, IsAllowed = isAllowed };

    /// <summary>Flips an existing mapping between allow and deny (matrix tri-state edit).</summary>
    public void SetAllowed(bool isAllowed) => IsAllowed = isAllowed;
}
