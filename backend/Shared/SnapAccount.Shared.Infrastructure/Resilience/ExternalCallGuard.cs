using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;
using Polly.Registry;

namespace SnapAccount.Shared.Infrastructure.Resilience;

/// <summary>
/// Wraps calls to non-HTTP SDK dependencies (Firebase Admin, Google Pub/Sub, GCS, …)
/// in a per-dependency resilience pipeline: concurrency limiter → circuit breaker → timeout.
/// A dependency that is down or hanging fails fast (BrokenCircuitException /
/// TimeoutRejectedException) instead of stalling request threads, and recovers
/// automatically once the breaker's probe succeeds.
/// </summary>
public interface IExternalCallGuard
{
    Task<T> ExecuteAsync<T>(string dependency, Func<CancellationToken, Task<T>> action, CancellationToken ct = default);
    Task ExecuteAsync(string dependency, Func<CancellationToken, Task> action, CancellationToken ct = default);
}

public sealed class ExternalCallGuard(
    IConfiguration configuration,
    ILogger<ExternalCallGuard> logger) : IExternalCallGuard, IDisposable
{
    private readonly ResiliencePipelineRegistry<string> _registry = new();

    public async Task<T> ExecuteAsync<T>(string dependency, Func<CancellationToken, Task<T>> action, CancellationToken ct = default)
    {
        var pipeline = _registry.GetOrAddPipeline(dependency, builder => Configure(builder, dependency));
        return await pipeline.ExecuteAsync(
            async token => await action(token).ConfigureAwait(false), ct).ConfigureAwait(false);
    }

    public async Task ExecuteAsync(string dependency, Func<CancellationToken, Task> action, CancellationToken ct = default)
    {
        var pipeline = _registry.GetOrAddPipeline(dependency, builder => Configure(builder, dependency));
        await pipeline.ExecuteAsync(
            async token => await action(token).ConfigureAwait(false), ct).ConfigureAwait(false);
    }

    private void Configure(ResiliencePipelineBuilder builder, string dependency)
    {
        var options = DependencyResilienceOptions.Resolve(configuration, "Dependency", dependency);
        if (!options.Enabled)
        {
            return; // empty pipeline — pass-through
        }

        // Outermost first. The breaker sits outside the timeout so timeouts count
        // as failures and a consistently-hanging dependency trips it open.
        builder.AddConcurrencyLimiter(options.MaxConcurrency, options.MaxQueuedRequests);
        builder.AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = options.BreakerFailureRatio,
            MinimumThroughput = options.BreakerMinimumThroughput,
            SamplingDuration = TimeSpan.FromSeconds(options.BreakerSamplingSeconds),
            BreakDuration = TimeSpan.FromSeconds(options.BreakerBreakSeconds),
            OnOpened = args =>
            {
                logger.LogWarning(
                    "Circuit OPEN for dependency '{Dependency}' — fast-failing calls for {BreakSeconds}s. Last outcome: {Outcome}",
                    dependency, args.BreakDuration.TotalSeconds,
                    args.Outcome.Exception?.GetType().Name ?? "result");
                return default;
            },
            OnHalfOpened = _ =>
            {
                logger.LogInformation("Circuit HALF-OPEN for dependency '{Dependency}' — probing.", dependency);
                return default;
            },
            OnClosed = _ =>
            {
                logger.LogInformation("Circuit CLOSED for dependency '{Dependency}' — recovered.", dependency);
                return default;
            },
        });
        builder.AddTimeout(TimeSpan.FromSeconds(options.AttemptTimeoutSeconds));
    }

    public void Dispose() => _registry.Dispose();
}
