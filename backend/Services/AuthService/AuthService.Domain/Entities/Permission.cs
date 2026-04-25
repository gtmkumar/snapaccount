using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class Permission : BaseAuditableEntity
{
    public string Name { get; private set; } = string.Empty; // e.g. 'gst:return:file'
    public string Resource { get; private set; } = string.Empty; // e.g. 'gst'
    public string Action { get; private set; } = string.Empty; // e.g. 'return:file'
    public string? Description { get; private set; }

    private Permission() { }

    public static Permission Create(string name, string resource, string action, string? description = null)
        => new()
        {
            Name = name,
            Resource = resource,
            Action = action,
            Description = description
        };
}
