using System.Diagnostics;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// Redis-backed user presence service.
/// Uses key <c>presence:{userId}</c> with 30-second TTL.
/// TTL is refreshed on each heartbeat / connect.
/// DG-INFRA-06: wraps every Redis call in a Stopwatch; logs a warning for commands that exceed 100ms
/// (Redis backplane latency observability per docs/devops/observability-slos.md line 140).
/// </summary>
public sealed class PresenceService(
    IConnectionMultiplexer redis,
    ILogger<PresenceService> logger)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    // DG-INFRA-06: slow-command threshold per observability-slos.md line 140.
    private static readonly TimeSpan SlowCommandThreshold = TimeSpan.FromMilliseconds(100);

    /// <summary>Marks a user as online (sets / refreshes the Redis key).</summary>
    public async Task SetOnlineAsync(string userId)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var db = redis.GetDatabase();
            await db.StringSetAsync($"presence:{userId}", "1", Ttl);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PresenceService: Failed to set online for user {UserId}", userId);
        }
        finally
        {
            sw.Stop();
            if (sw.Elapsed > SlowCommandThreshold)
                logger.LogWarning(
                    "PresenceService: Redis SET presence:{UserId} took {ElapsedMs}ms (threshold {ThresholdMs}ms) — backplane slow command.",
                    userId, sw.ElapsedMilliseconds, (int)SlowCommandThreshold.TotalMilliseconds);
        }
    }

    /// <summary>Marks a user as offline (deletes the Redis key).</summary>
    public async Task SetOfflineAsync(string userId)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var db = redis.GetDatabase();
            await db.KeyDeleteAsync($"presence:{userId}");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PresenceService: Failed to set offline for user {UserId}", userId);
        }
        finally
        {
            sw.Stop();
            if (sw.Elapsed > SlowCommandThreshold)
                logger.LogWarning(
                    "PresenceService: Redis DEL presence:{UserId} took {ElapsedMs}ms (threshold {ThresholdMs}ms) — backplane slow command.",
                    userId, sw.ElapsedMilliseconds, (int)SlowCommandThreshold.TotalMilliseconds);
        }
    }

    /// <summary>Returns whether a user is currently online.</summary>
    public async Task<bool> IsOnlineAsync(string userId)
    {
        var sw = Stopwatch.StartNew();
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
        finally
        {
            sw.Stop();
            if (sw.Elapsed > SlowCommandThreshold)
                logger.LogWarning(
                    "PresenceService: Redis EXISTS presence:{UserId} took {ElapsedMs}ms (threshold {ThresholdMs}ms) — backplane slow command.",
                    userId, sw.ElapsedMilliseconds, (int)SlowCommandThreshold.TotalMilliseconds);
        }
    }
}
