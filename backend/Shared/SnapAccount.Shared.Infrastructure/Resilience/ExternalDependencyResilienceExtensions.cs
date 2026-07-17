using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.Registry;

namespace SnapAccount.Shared.Infrastructure.Resilience;

/// <summary>
/// Cascade-failure containment for external dependencies.
///
/// Applies a resilience pipeline to EVERY HttpClientFactory client
/// (Razorpay, MSG91, SendGrid, WhatsApp, FCM, GSTN/IRP/EWB, KYC, Gemini/Vertex,
/// Sarvam, bank adapters, cross-composite calls) and registers
/// <see cref="IExternalCallGuard"/> for SDK dependencies that bypass
/// HttpClientFactory (Firebase Admin token verification, Google Pub/Sub, GCS).
///
/// Pipeline per dependency (outermost → innermost):
///   concurrency limiter → total timeout → [retry] → circuit breaker → attempt timeout
///
/// Implemented as an <see cref="IHttpMessageHandlerBuilderFilter"/> rather than
/// ConfigureHttpClientDefaults + AddResilienceHandler: the defaults builder has no
/// per-client name, which makes AddResilienceHandler share ONE pipeline (and one
/// circuit breaker) across every client — a single dead dependency would then
/// fast-fail all of them. The filter sees each client's real name, so state is
/// isolated per dependency and a tripped breaker never affects any other. Tune
/// per dependency via "Resilience:Http:&lt;ClientName&gt;" /
/// "Resilience:Dependency:&lt;Name&gt;" (see <see cref="DependencyResilienceOptions"/>).
/// </summary>
public static class ExternalDependencyResilienceExtensions
{
    public static IServiceCollection AddExternalDependencyResilience(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.TryAddSingleton<IExternalCallGuard>(sp => new ExternalCallGuard(
            configuration,
            sp.GetRequiredService<ILoggerFactory>().CreateLogger<ExternalCallGuard>()));

        // Typed descriptor so TryAddEnumerable can dedupe repeat calls (composites call
        // this once per host, but modules could too). The filter resolves IConfiguration
        // from the container — in every host that is the same configuration instance.
        services.TryAddEnumerable(
            ServiceDescriptor.Singleton<IHttpMessageHandlerBuilderFilter, HttpResilienceHandlerFilter>());

        return services;
    }
}

/// <summary>
/// Adds the per-client resilience handler as the innermost DelegatingHandler of
/// every HttpClient the factory builds. Pipelines are cached per client name, so
/// circuit-breaker state survives the factory's periodic handler rotation.
/// </summary>
internal sealed class HttpResilienceHandlerFilter(
    IConfiguration configuration,
    ILoggerFactory loggerFactory) : IHttpMessageHandlerBuilderFilter, IDisposable
{
    private readonly ResiliencePipelineRegistry<string> _registry = new();
    private readonly ILogger _logger = loggerFactory.CreateLogger("SnapAccount.Resilience.Http");

    public Action<HttpMessageHandlerBuilder> Configure(Action<HttpMessageHandlerBuilder> next) =>
        builder =>
        {
            next(builder);

            var clientName = string.IsNullOrEmpty(builder.Name) ? "Default" : builder.Name;
            var options = DependencyResilienceOptions.Resolve(configuration, "Http", clientName);
            if (!options.Enabled)
            {
                return;
            }

            var pipeline = _registry.GetOrAddPipeline<HttpResponseMessage>(
                clientName,
                pipelineBuilder => BuildPipeline(pipelineBuilder, clientName, options));
            builder.AdditionalHandlers.Add(new ResilienceHandler(pipeline));
        };

    private void BuildPipeline(
        ResiliencePipelineBuilder<HttpResponseMessage> pipeline,
        string clientName,
        DependencyResilienceOptions options)
    {
        pipeline.AddConcurrencyLimiter(options.MaxConcurrency, options.MaxQueuedRequests);
        pipeline.AddTimeout(TimeSpan.FromSeconds(options.TotalTimeoutSeconds));

        if (options.MaxRetries > 0)
        {
            pipeline.AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = options.MaxRetries,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
            });
        }

        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = options.BreakerFailureRatio,
            MinimumThroughput = options.BreakerMinimumThroughput,
            SamplingDuration = TimeSpan.FromSeconds(options.BreakerSamplingSeconds),
            BreakDuration = TimeSpan.FromSeconds(options.BreakerBreakSeconds),
            OnOpened = args =>
            {
                _logger.LogWarning(
                    "Circuit OPEN for HTTP dependency '{Client}' — fast-failing calls for {BreakSeconds}s. Last outcome: {Outcome}",
                    clientName, args.BreakDuration.TotalSeconds,
                    args.Outcome.Exception?.GetType().Name ?? $"HTTP {(int?)args.Outcome.Result?.StatusCode}");
                return default;
            },
            OnHalfOpened = _ =>
            {
                _logger.LogInformation("Circuit HALF-OPEN for HTTP dependency '{Client}' — probing.", clientName);
                return default;
            },
            OnClosed = _ =>
            {
                _logger.LogInformation("Circuit CLOSED for HTTP dependency '{Client}' — recovered.", clientName);
                return default;
            },
        });
        pipeline.AddTimeout(TimeSpan.FromSeconds(options.AttemptTimeoutSeconds));
    }

    public void Dispose() => _registry.Dispose();
}
