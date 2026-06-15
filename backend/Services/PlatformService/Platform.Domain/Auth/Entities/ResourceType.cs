using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A configurable permission resource (the "what" — e.g. gst, itr, document) —
/// gap #3 of the enhanced authz model. Promotes the free-text
/// <c>permission.resource</c> string into a first-class catalog so new modules can
/// be added as data. Stored in <c>auth.resource_type</c> (migration 044).
/// </summary>
public class ResourceType : BaseAuditableEntity
{
    public string Key { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsActive { get; private set; } = true;

    private ResourceType() { }

    public static ResourceType Create(string key, string name, string? description = null)
        => new() { Key = key, Name = name, Description = description };

    public void SetActive(bool active) => IsActive = active;

    /// <summary>Renames / re-describes the type (Key is immutable).</summary>
    public void Update(string name, string? description)
    {
        Name = name;
        Description = description;
    }
}
