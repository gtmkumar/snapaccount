using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// Startup-cached routing rule engine.
/// Loads chat.routing_rules at startup, matches keywords to categories.
/// Cache is refreshed via <see cref="RefreshAsync"/> (called after admin rule update).
/// </summary>
public sealed class RoutingRuleEngine(
    IServiceScopeFactory scopeFactory,
    ILogger<RoutingRuleEngine> logger) : IRoutingRuleEngine
{
    private volatile IReadOnlyList<CachedRule> _rules = [];

    /// <summary>Loads rules from the database. Called once at startup.</summary>
    public async Task RefreshAsync(CancellationToken ct = default)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Infrastructure.Persistence.ChatServiceDbContext>();

            var rules = await db.RoutingRules
                .Where(r => r.IsActive && r.DeletedAt == null)
                .OrderBy(r => r.Priority)
                .Select(r => new CachedRule(r.Keyword, r.Category))
                .ToListAsync(ct);

            _rules = rules;
            logger.LogInformation("RoutingRuleEngine: Loaded {Count} rules.", rules.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "RoutingRuleEngine: Failed to load rules.");
        }
    }

    /// <inheritdoc />
    public ThreadCategory? Match(string messageBody)
    {
        if (string.IsNullOrWhiteSpace(messageBody))
            return null;

        var lower = messageBody.ToLowerInvariant();

        foreach (var rule in _rules)
        {
            if (lower.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
                return rule.Category;
        }

        return null;
    }

    private sealed record CachedRule(string Keyword, ThreadCategory Category);
}
