using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A configurable permission action (the "what can be done" — e.g. returns.file,
/// members.read) — gap #3 of the enhanced authz model. Promotes the free-text
/// <c>permission.action</c> string into a first-class catalog so new actions can be
/// added as data. Stored in <c>auth.action_type</c> (migration 044).
/// </summary>
public class ActionType : BaseAuditableEntity
{
    public string Key { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsActive { get; private set; } = true;

    private ActionType() { }

    public static ActionType Create(string key, string name, string? description = null)
        => new() { Key = key, Name = name, Description = description };

    public void SetActive(bool active) => IsActive = active;

    /// <summary>Renames / re-describes the type (Key is immutable).</summary>
    public void Update(string name, string? description)
    {
        Name = name;
        Description = description;
    }
}
