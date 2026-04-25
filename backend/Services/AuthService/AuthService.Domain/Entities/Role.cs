using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class Role : BaseAuditableEntity
{
    public string Name { get; private set; } = string.Empty;
    public string DisplayName { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsSystemRole { get; private set; }
    public bool IsActive { get; private set; } = true;

    private readonly List<RolePermission> _permissions = [];
    public IReadOnlyCollection<RolePermission> Permissions => _permissions.AsReadOnly();

    private Role() { }

    public static Role Create(string name, string displayName, string? description = null, bool isSystemRole = false)
        => new()
        {
            Name = name,
            DisplayName = displayName,
            Description = description,
            IsSystemRole = isSystemRole
        };
}
