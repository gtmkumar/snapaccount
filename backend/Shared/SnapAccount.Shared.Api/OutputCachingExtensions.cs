using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;

namespace SnapAccount.Shared.Api;

/// <summary>
/// Server-side output caching for master/reference-data endpoints whose JSON is identical
/// across users and changes rarely (tax-rate config, loan products, reference data, plan
/// catalogs, permission catalog, …). The rendered response body is cached once and served
/// directly on subsequent requests, skipping MediatR + EF entirely.
///
/// Safety model — why caching authenticated endpoints is OK here:
///  - <c>app.UseOutputCache()</c> is registered AFTER <c>FirebaseAuthMiddleware</c> and
///    <c>UseAuthorization()</c>, so every request — including a cache hit — still passes
///    authentication and endpoint authorization. Only the response BODY is shared.
///  - Only endpoints explicitly opted in via <c>.CacheOutput("master-data:…")</c> are cached,
///    and only when their handlers contain no ICurrentUser / org / user filtering. Anything
///    personalized stays fully dynamic (the "holes" stay per-request).
///  - NEVER cache an endpoint whose command/query class carries <c>[RequiresPermission]</c>:
///    that RBAC check runs inside the MediatR pipeline, which a cache hit skips entirely.
///    Only endpoints whose authorization is complete at the HTTP layer qualify.
///  - The custom policy never caches non-200 responses or responses that set cookies.
///
/// Freshness model:
///  - TTL (default 10 min) = regeneration on a schedule; bounds staleness across instances.
///  - Tag-based eviction = regeneration on content change: admin write endpoints call
///    <see cref="EvictMasterDataAsync"/> after a successful mutation, so the next read
///    re-renders immediately on this instance.
///  - Cache key varies by path + full query string + Accept-Language, so locale-sensitive
///    output (e.g. loan KFS templates) and query variations never collide.
///
/// Store is the in-memory default: correct per instance, TTL-bounded across instances.
/// If multi-instance staleness after admin edits ever matters, swap in
/// Microsoft.AspNetCore.OutputCaching.StackExchangeRedis (AddStackExchangeRedisOutputCache)
/// — policies, tags and eviction calls all carry over unchanged.
/// </summary>
public static class OutputCachingExtensions
{
    /// <summary>Prefix for all master-data policy names; the suffix doubles as the eviction tag.</summary>
    public const string MasterDataPolicyPrefix = "master-data:";

    /// <summary>Default TTL for cached master-data responses (scheduled regeneration).</summary>
    public static readonly TimeSpan DefaultMasterDataTtl = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Registers output caching with one named policy per master-data dataset. Each name is
    /// <c>"master-data:&lt;tag&gt;"</c>; endpoints opt in with <c>.CacheOutput(name)</c> and
    /// writes evict with <see cref="EvictMasterDataAsync"/> using the same <paramref name="tags"/> value.
    /// </summary>
    public static IServiceCollection AddMasterDataOutputCache(
        this IServiceCollection services, params string[] tags)
    {
        services.AddOutputCache(options =>
        {
            foreach (var tag in tags)
            {
                options.AddPolicy(
                    MasterDataPolicyPrefix + tag,
                    builder => builder
                        .AddPolicy<MasterDataCachePolicy>()
                        .Expire(DefaultMasterDataTtl)
                        .SetVaryByQuery("*")
                        .SetVaryByHeader("Accept-Language")
                        .Tag(tag),
                    excludeDefaultPolicy: true);
            }
        });
        return services;
    }

    /// <summary>
    /// Evicts every cached response tagged with <paramref name="tag"/>. Call from admin write
    /// endpoints after a successful mutation so reads re-render immediately (content-change
    /// regeneration). Never throws — a failed eviction only means the TTL bounds staleness.
    /// </summary>
    public static async ValueTask EvictMasterDataAsync(
        this IOutputCacheStore store, string tag, ILogger logger, CancellationToken ct = default)
    {
        try
        {
            await store.EvictByTagAsync(tag, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Output-cache eviction for tag {Tag} failed; stale reads possible until TTL expiry.", tag);
        }
    }

    /// <summary>
    /// Replacement for the framework default policy, which refuses to cache any request that
    /// carries an Authorization header. Master-data endpoints are authenticated but their body
    /// is user-independent, and auth runs BEFORE the cache middleware — so caching is safe and
    /// deliberate here. Everything else mirrors the default: GET/HEAD only, 200 only, never
    /// cache Set-Cookie responses.
    /// </summary>
    private sealed class MasterDataCachePolicy : IOutputCachePolicy
    {
        ValueTask IOutputCachePolicy.CacheRequestAsync(OutputCacheContext context, CancellationToken ct)
        {
            var method = context.HttpContext.Request.Method;
            var cacheable = HttpMethods.IsGet(method) || HttpMethods.IsHead(method);

            context.EnableOutputCaching = true;
            context.AllowCacheLookup = cacheable;
            context.AllowCacheStorage = cacheable;
            context.AllowLocking = true;
            return ValueTask.CompletedTask;
        }

        ValueTask IOutputCachePolicy.ServeFromCacheAsync(OutputCacheContext context, CancellationToken ct)
            => ValueTask.CompletedTask;

        ValueTask IOutputCachePolicy.ServeResponseAsync(OutputCacheContext context, CancellationToken ct)
        {
            var response = context.HttpContext.Response;
            if (response.StatusCode != StatusCodes.Status200OK ||
                !StringValues.IsNullOrEmpty(response.Headers.SetCookie))
            {
                context.AllowCacheStorage = false;
            }
            return ValueTask.CompletedTask;
        }
    }
}
