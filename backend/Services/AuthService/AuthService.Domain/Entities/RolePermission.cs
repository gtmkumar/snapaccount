using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class RolePermission : BaseAuditableEntity
{
    public Guid RoleId { get; private set; }
    public Guid PermissionId { get; private set; }

    public Role? Role { get; private set; }
    public Permission? Permission { get; private set; }

    private RolePermission() { }

    public static RolePermission Create(Guid roleId, Guid permissionId)
        => new() { RoleId = roleId, PermissionId = permissionId };
}
