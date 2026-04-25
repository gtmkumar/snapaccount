using ChatService.Domain.Enums;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// Keyword-to-category routing rule.
/// Canonical table: chat.routing_rules (migration 029, seeded).
/// Rules are loaded at startup and cached by <see cref="RoutingRuleEngine"/>.
/// </summary>
public class RoutingRule : BaseAuditableEntity
{
    /// <summary>Keyword to match (case-insensitive) in the first user message.</summary>
    public string Keyword { get; private set; } = string.Empty;

    /// <summary>Category to assign when the keyword matches.</summary>
    public ThreadCategory Category { get; private set; }

    /// <summary>Lower number = higher priority when multiple rules match.</summary>
    public int Priority { get; private set; }

    /// <summary>Whether this rule is active.</summary>
    public bool IsActive { get; private set; } = true;

    private RoutingRule() { }

    /// <summary>Creates a routing rule.</summary>
    public static RoutingRule Create(string keyword, ThreadCategory category, int priority = 100)
        => new()
        {
            Keyword = keyword.ToLowerInvariant(),
            Category = category,
            Priority = priority,
            IsActive = true
        };
}
