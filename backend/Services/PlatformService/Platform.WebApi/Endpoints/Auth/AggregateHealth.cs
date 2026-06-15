using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

namespace AuthService.Api.Endpoints;

/// <summary>
/// GET /admin/health/aggregate — aggregated health check for the SnapAccount composite services.
///
/// Fans out in parallel to each service's /healthz endpoint. Base URLs come from
/// <c>Health:Services</c> configuration (localhost ports in Development; service-discovery
/// hostnames in deployed environments).
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

    private static readonly (string Name, string DefaultBaseUrl)[] DefaultServices =
    [
        ("api-gateway",      "http://api-gateway"),
        ("platform-service", "http://platform-service"),
        ("finance-service",  "http://finance-service"),
        ("assist-service",   "http://assist-service"),
    ];

    /// <summary>Local dev fallback when <c>Health:Services</c> is not configured.</summary>
    private static readonly (string Name, string BaseUrl)[] LocalDevServices =
    [
        ("api-gateway",      "http://localhost:5000"),
        ("platform-service", "http://localhost:5201"),
        ("finance-service",  "http://localhost:5202"),
        ("assist-service",   "http://localhost:5203"),
    ];

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        g.MapGet("/health/aggregate", GetAggregateHealth)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetAggregateHealth")
            .WithSummary(
                "Aggregated health check for API gateway and composite services. " +
                "Requires admin.dashboard.read permission. " +
                "Latency: up to 3 s (parallel probe, bounded by slowest service).");
    }

    private static async Task<IResult> GetAggregateHealth(
        IHttpClientFactory httpClientFactory,
        ICurrentUser currentUser,
        IConfiguration configuration,
        IHostEnvironment environment,
        CancellationToken ct)
    {
        // Permission gate: admin.dashboard.read (inline check; endpoint does not use MediatR)
        if (!currentUser.IsAuthenticated)
            return Results.Unauthorized();
        if (!currentUser.HasPermission("admin.dashboard.read"))
            return Results.Forbid();

        var services = ResolveServices(configuration, environment);

        var probed = await Task.WhenAll(
            services.Select(svc => ProbeServiceAsync(httpClientFactory, svc.Name, svc.BaseUrl, ct)));

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

    private static IReadOnlyList<(string Name, string BaseUrl)> ResolveServices(
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        if (environment.IsDevelopment())
            return LocalDevServices;

        var section = configuration.GetSection("Health:Services");
        return DefaultServices
            .Select(s => (s.Name, section[s.Name] ?? s.DefaultBaseUrl))
            .ToList();
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
