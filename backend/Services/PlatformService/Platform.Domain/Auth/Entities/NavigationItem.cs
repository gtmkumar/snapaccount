using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A single backend-driven navigation (menu) entry — design "Navigation (Menu)".
/// The admin sidebar is rendered from these rows and permission-filtered per user,
/// replacing the hardcoded frontend array. <see cref="ParentId"/> supports grouped
/// menus; flat items have it null. <see cref="IconKey"/> is a lucide-react icon
/// name resolved on the client. Stored in <c>auth.navigation_item</c> (migration 042).
/// </summary>
public class NavigationItem : BaseAuditableEntity
{
    /// <summary>Stable identifier (e.g. "gst", "loans.partner_banks").</summary>
    public string Key { get; private set; } = string.Empty;

    /// <summary>Parent menu for grouping; null for top-level items.</summary>
    public Guid? ParentId { get; private set; }

    /// <summary>English fallback label; the client prefers the i18n key <c>nav.{Key}</c>.</summary>
    public string Label { get; private set; } = string.Empty;

    /// <summary>lucide-react icon component name, mapped to a component on the client.</summary>
    public string? IconKey { get; private set; }

    /// <summary>Route the item links to.</summary>
    public string Url { get; private set; } = string.Empty;

    /// <summary>Sort order within its parent level (ascending).</summary>
    public int DisplayOrder { get; private set; }

    /// <summary>Soft on/off switch independent of soft-delete.</summary>
    public bool IsActive { get; private set; } = true;

    private NavigationItem() { }

    public static NavigationItem Create(
        string key, string label, string url,
        string? iconKey = null, int displayOrder = 0, Guid? parentId = null)
        => new()
        {
            Key = key,
            Label = label,
            Url = url,
            IconKey = iconKey,
            DisplayOrder = displayOrder,
            ParentId = parentId,
        };

    public void SetActive(bool active) => IsActive = active;

    /// <summary>Updates the editable fields (Key is immutable, like a permission name).</summary>
    public void Update(string label, string url, string? iconKey, int displayOrder, Guid? parentId, bool isActive)
    {
        Label = label;
        Url = url;
        IconKey = iconKey;
        DisplayOrder = displayOrder;
        ParentId = parentId;
        IsActive = isActive;
    }
}
