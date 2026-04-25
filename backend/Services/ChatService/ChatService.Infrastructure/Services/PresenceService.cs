using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// Redis-backed user presence service.
/// Uses key <c>presence:{userId}</c> with 30-second TTL.
/// TTL is refreshed on each heartbeat / connect.
/// </summary>
public sealed class PresenceService(
    IConnectionMultiplexer redis,
    ILogger<PresenceService> logger)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    /// <summary>Marks a user as online (sets / refreshes the Redis key).</summary>
    public async Task SetOnlineAsync(string userId)
    {
        try
        {
            var db = redis.GetDatabase();
            await db.StringSetAsync($"presence:{userId}", "1", Ttl);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PresenceService: Failed to set online for user {UserId}", userId);
        }
    }

    /// <summary>Marks a user as offline (deletes the Redis key).</summary>
    public async Task SetOfflineAsync(string userId)
    {
        try
        {
            var db = redis.GetDatabase();
            await db.KeyDeleteAsync($"presence:{userId}");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PresenceService: Failed to set offline for user {UserId}", userId);
        }
    }

    /// <summary>Returns whether a user is currently online.</summary>
    public async Task<bool> IsOnlineAsync(string userId)
    {
        try
        {
            var db = redis.GetDatabase();
            return await db.KeyExistsAsync($"presence:{userId}");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PresenceService: Failed to check presence for user {UserId}", userId);
            return false;
        }
    }
}
