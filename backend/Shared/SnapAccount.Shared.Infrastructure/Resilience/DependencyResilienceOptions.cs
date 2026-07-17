using Microsoft.Extensions.Configuration;

namespace SnapAccount.Shared.Infrastructure.Resilience;

/// <summary>
/// Tuning knobs for one external dependency's resilience pipeline
/// (circuit breaker + timeouts + concurrency limit). Every value can be
/// overridden per dependency via configuration:
///
///   Resilience:Http:Default            — defaults for all HttpClientFactory clients
///   Resilience:Http:&lt;ClientName&gt;      — per named/typed client (e.g. "Razorpay", "IAiProviderResolver")
///   Resilience:Dependency:Default      — defaults for non-HTTP SDK dependencies (IExternalCallGuard)
///   Resilience:Dependency:&lt;Name&gt;      — per guarded dependency (e.g. "firebase-auth", "pubsub", "gcs")
///
/// Rationale for the defaults:
///  - MaxRetries = 0: most outbound calls here are non-idempotent POSTs (payments,
///    SMS/email sends, GST filings) where a blind retry can double-submit. Opt in
///    per client where the API is idempotent.
///  - MaxConcurrency caps how many request threads can be stuck waiting on one
///    slow dependency; the queue bounds the pile-up behind them. Excess callers
///    fail fast instead of exhausting the thread pool / connection pool.
///  - The breaker trips on a 50% failure ratio so a dependency that is hard-down
///    or timing out stops being called at all until it recovers.
/// </summary>
public sealed class DependencyResilienceOptions
{
    /// <summary>Set false to bypass the pipeline entirely for one dependency.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Timeout for a single attempt against the dependency.</summary>
    public double AttemptTimeoutSeconds { get; set; } = 10;

    /// <summary>Overall deadline across retries for one logical call (HTTP only).</summary>
    public double TotalTimeoutSeconds { get; set; } = 30;

    /// <summary>Extra attempts after the first. 0 = no retry (safe default for non-idempotent calls).</summary>
    public int MaxRetries { get; set; }

    /// <summary>Maximum in-flight calls to this dependency (bulkhead).</summary>
    public int MaxConcurrency { get; set; } = 50;

    /// <summary>Callers allowed to queue for a permit; beyond this they are rejected immediately.</summary>
    public int MaxQueuedRequests { get; set; } = 50;

    /// <summary>Fraction of failures within the sampling window that trips the breaker.</summary>
    public double BreakerFailureRatio { get; set; } = 0.5;

    /// <summary>Minimum calls in the sampling window before the ratio is evaluated.</summary>
    public int BreakerMinimumThroughput { get; set; } = 10;

    /// <summary>Rolling window over which the failure ratio is measured.</summary>
    public double BreakerSamplingSeconds { get; set; } = 30;

    /// <summary>How long the breaker stays open (fast-failing) before probing again.</summary>
    public double BreakerBreakSeconds { get; set; } = 15;

    /// <summary>
    /// Resolves options for one dependency: code defaults, overlaid with the
    /// config Default section, overlaid with the dependency-specific section.
    /// </summary>
    public static DependencyResilienceOptions Resolve(IConfiguration configuration, string kind, string dependencyName)
    {
        var options = new DependencyResilienceOptions();
        configuration.GetSection($"Resilience:{kind}:Default").Bind(options);
        configuration.GetSection($"Resilience:{kind}:{dependencyName}").Bind(options);
        return options;
    }
}
