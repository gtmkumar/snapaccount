using ChatService.Domain.Enums;

namespace ChatService.Application.Common.Interfaces;

/// <summary>
/// Matches a message body against chat.routing_rules to determine the thread category.
/// Implementation caches rules at startup and refreshes on rule change.
/// </summary>
public interface IRoutingRuleEngine
{
    /// <summary>
    /// Returns the highest-priority matching category for the given text,
    /// or <c>null</c> if no rule matches.
    /// </summary>
    ThreadCategory? Match(string messageBody);

    /// <summary>Refreshes the in-memory rule cache from the database.</summary>
    Task RefreshAsync(CancellationToken ct = default);
}
