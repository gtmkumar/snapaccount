using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class UserRole : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid RoleId { get; private set; }
    public bool IsActive { get; private set; } = true;

    public Role? Role { get; private set; }

    private UserRole() { }

    public static UserRole Create(Guid userId, Guid roleId)
        => new() { UserId = userId, RoleId = roleId };

    public void Deactivate() => IsActive = false;
}
