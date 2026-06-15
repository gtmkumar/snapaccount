using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

namespace AuthService.Api.Endpoints;

/// <summary>
/// GET /admin/health/aggregate — aggregated health check for all 12 SnapAccount microservices.
///
/// Fans out in parallel to each service's /healthz endpoint using Aspire service-discovery-resolved
/// HTTP clients. Returns the probe results and an overall rollup status.
///
/// Gate: admin.dashboard.read permission.
/// Timeout: 3 s per service (parallel; total wall-time bounded by slowest service).
/// Rate limit: standard (100 req/min).
///
/// This endpoint replaces the browser-side fan-out in healthApi.ts::getAggregateHealth().
/// The frontend tries this route first and falls back to per-service probes if 404.
/// </summary>
public sealed class AggregateHealth : EndpointGroupBase
{
    /// <summary>Route prefix — /admin to match the PlatformAdmin group convention.</summary>
    public override string? GroupName => "/admin";

    private static readonly (string Name, string BaseUrl)[] Services =
    [
        ("auth-service",         "http://auth-service"),
        ("document-service",     "http://document-service"),
        ("accounting-service",   "http://accounting-service"),
        ("gst-service",          "http://gst-service"),
        ("loan-service",         "http://loan-service"),
        ("itr-service",          "http://itr-service"),
        ("chat-service",         "http://chat-service"),
        ("notification-service", "http://notification-service"),
        ("report-service",       "http://report-service"),
        ("subscription-service", "http://subscription-service"),
        ("ai-service",           "http://ai-service"),
        ("callback-service",     "http://callback-service"),
    ];

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        g.MapGet("/health/aggregate", GetAggregateHealth)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetAggregateHealth")
            .WithSummary(
                "Aggregated health check for all 12 SnapAccount services. " +
                "Requires admin.dashboard.read permission. " +
                "Latency: up to 3 s (parallel probe, bounded by slowest service).");
    }

    private static async Task<IResult> GetAggregateHealth(
        IHttpClientFactory httpClientFactory,
        ICurrentUser currentUser,
        CancellationToken ct)
    {
        // Permission gate: admin.dashboard.read (inline check; endpoint does not use MediatR)
        if (!currentUser.IsAuthenticated)
            return Results.Unauthorized();
        if (!currentUser.HasPermission("admin.dashboard.read"))
            return Results.Forbid();

        var probed = await Task.WhenAll(
            Services.Select(svc => ProbeServiceAsync(httpClientFactory, svc.Name, svc.BaseUrl, ct)));

        var statuses = probed.Select(p => p.Status).ToArray();
        string overall = statuses.All(s => s == "healthy") ? "healthy"
            : statuses.Any(s => s == "down")               ? "down"
            : statuses.Any(s => s == "degraded")           ? "degraded"
            : "unknown";

        return Results.Ok(new
        {
            overall,
            services  = probed,
            checkedAt = DateTime.UtcNow.ToString("O"),
        });
    }

    private static async Task<ServiceHealthResult> ProbeServiceAsync(
        IHttpClientFactory httpClientFactory,
        string name,
        string baseUrl,
        CancellationToken ct)
    {
        var checkedAt = DateTime.UtcNow.ToString("O");
        var sw        = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            using var client = httpClientFactory.CreateClient("HealthProbe");
            using var cts    = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            var response = await client.GetAsync($"{baseUrl}/healthz", cts.Token);
            sw.Stop();

            var status = response.IsSuccessStatusCode ? "healthy" : "degraded";
            return new ServiceHealthResult(name, status, (int)sw.ElapsedMilliseconds, checkedAt, null);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // Per-service timeout — mark as degraded (service is slow, not necessarily down)
            sw.Stop();
            return new ServiceHealthResult(name, "degraded", (int)sw.ElapsedMilliseconds, checkedAt, "Probe timed out (3 s)");
        }
        catch (HttpRequestException ex)
        {
            // Network error — service unreachable
            sw.Stop();
            return new ServiceHealthResult(name, "down", (int)sw.ElapsedMilliseconds, checkedAt, ex.Message);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new ServiceHealthResult(name, "unknown", null, checkedAt, ex.Message);
        }
    }
}

/// <summary>Health probe result for a single service.</summary>
internal record ServiceHealthResult(
    string Name,
    string Status,
    int? ResponseMs,
    string CheckedAt,
    string? Detail);
