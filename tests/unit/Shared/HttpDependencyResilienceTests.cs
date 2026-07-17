using System.Diagnostics;
using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Polly.CircuitBreaker;
using Polly.RateLimiting;
using Polly.Timeout;
using SnapAccount.Shared.Infrastructure.Resilience;
using Xunit;

namespace SnapAccount.Shared.Tests;

/// <summary>
/// Verifies the outbound-HTTP cascade containment added by
/// AddExternalDependencyResilience: a failing or hanging dependency trips its
/// circuit breaker and fast-fails, its concurrency is bounded, unrelated
/// dependencies keep working, and the circuit recovers once the dependency does.
/// </summary>
public class HttpDependencyResilienceTests
{
    /// <summary>Countable stub for the primary handler so tests can assert the dependency was NOT called.</summary>
    private sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> impl)
        : HttpMessageHandler
    {
        private int _calls;
        public int Calls => Volatile.Read(ref _calls);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            return impl(request, ct);
        }
    }

    private static ServiceProvider BuildProvider(
        Dictionary<string, StubHandler> clients,
        Dictionary<string, string?>? extraConfig = null)
    {
        var settings = new Dictionary<string, string?>
        {
            // Aggressive test thresholds: breaker evaluates after 2 calls, opens at 50% failures.
            ["Resilience:Http:Default:BreakerMinimumThroughput"] = "2",
            ["Resilience:Http:Default:BreakerFailureRatio"] = "0.5",
            ["Resilience:Http:Default:BreakerSamplingSeconds"] = "5",
            ["Resilience:Http:Default:BreakerBreakSeconds"] = "0.6",
            ["Resilience:Http:Default:AttemptTimeoutSeconds"] = "1",
            ["Resilience:Http:Default:TotalTimeoutSeconds"] = "5",
        };
        foreach (var (key, value) in extraConfig ?? [])
        {
            settings[key] = value;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddExternalDependencyResilience(configuration);
        foreach (var (name, handler) in clients)
        {
            services.AddHttpClient(name, c => c.BaseAddress = new Uri("http://dependency.test/"))
                .ConfigurePrimaryHttpMessageHandler(() => handler);
        }

        return services.BuildServiceProvider();
    }

    private static StubHandler AlwaysStatus(HttpStatusCode status) =>
        new((_, _) => Task.FromResult(new HttpResponseMessage(status)));

    [Fact]
    public async Task FailingDependency_TripsBreaker_AndFastFailsWithoutCallingIt()
    {
        var failing = AlwaysStatus(HttpStatusCode.InternalServerError);
        await using var provider = BuildProvider(new() { ["dep-a"] = failing });
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("dep-a");

        // Two 5xx responses reach the minimum throughput and trip the breaker.
        (await client.GetAsync("/x")).StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        (await client.GetAsync("/x")).StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        failing.Calls.Should().Be(2);

        // Open circuit: the call fails fast and the dependency is not touched again.
        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAsync<BrokenCircuitException>(() => client.GetAsync("/x"));
        stopwatch.Stop();

        failing.Calls.Should().Be(2, "an open circuit must not forward calls to the dependency");
        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(1), "fast-fail must not wait on any timeout");
    }

    [Fact]
    public async Task OpenCircuitOnOneDependency_DoesNotAffectOtherDependencies()
    {
        var failing = AlwaysStatus(HttpStatusCode.ServiceUnavailable);
        var healthy = AlwaysStatus(HttpStatusCode.OK);
        await using var provider = BuildProvider(new() { ["dep-down"] = failing, ["dep-healthy"] = healthy });
        var factory = provider.GetRequiredService<IHttpClientFactory>();

        var down = factory.CreateClient("dep-down");
        await down.GetAsync("/x");
        await down.GetAsync("/x");
        await Assert.ThrowsAsync<BrokenCircuitException>(() => down.GetAsync("/x")); // breaker open

        // Unrelated dependency is untouched by dep-down's open circuit.
        var ok = await factory.CreateClient("dep-healthy").GetAsync("/y");
        ok.StatusCode.Should().Be(HttpStatusCode.OK);
        healthy.Calls.Should().Be(1);
    }

    [Fact]
    public async Task HangingDependency_IsCutOff_AtAttemptTimeout()
    {
        var hanging = new StubHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        await using var provider = BuildProvider(new() { ["dep-slow"] = hanging });
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("dep-slow");

        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAsync<TimeoutRejectedException>(() => client.GetAsync("/x"));
        stopwatch.Stop();

        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(5),
            "the 1s attempt timeout must cut the call off long before the dependency's 30s hang");
    }

    [Fact]
    public async Task HungDependency_CannotConsumeUnboundedConcurrency()
    {
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var hung = new StubHandler(async (_, ct) =>
        {
            await gate.Task.WaitAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        await using var provider = BuildProvider(
            new() { ["dep-hung"] = hung },
            new()
            {
                ["Resilience:Http:dep-hung:MaxConcurrency"] = "2",
                ["Resilience:Http:dep-hung:MaxQueuedRequests"] = "0",
                ["Resilience:Http:dep-hung:AttemptTimeoutSeconds"] = "30",
                ["Resilience:Http:dep-hung:TotalTimeoutSeconds"] = "30",
            });
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("dep-hung");

        // Two calls occupy every permit for the dependency…
        var inFlight1 = client.GetAsync("/x");
        var inFlight2 = client.GetAsync("/x");
        while (hung.Calls < 2)
        {
            await Task.Delay(10);
        }

        // …so the third is rejected immediately instead of piling onto the hung dependency.
        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAsync<RateLimiterRejectedException>(() => client.GetAsync("/x"));
        stopwatch.Stop();

        hung.Calls.Should().Be(2);
        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(1));

        gate.SetResult();
        await Task.WhenAll(inFlight1, inFlight2);
    }

    [Fact]
    public async Task Breaker_ClosesAgain_WhenDependencyRecovers()
    {
        var healthy = false;
        var flappy = new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(
            healthy ? HttpStatusCode.OK : HttpStatusCode.InternalServerError)));
        await using var provider = BuildProvider(new() { ["dep-flappy"] = flappy });
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("dep-flappy");

        await client.GetAsync("/x");
        await client.GetAsync("/x");
        await Assert.ThrowsAsync<BrokenCircuitException>(() => client.GetAsync("/x")); // open

        healthy = true;
        await Task.Delay(TimeSpan.FromMilliseconds(800)); // > 0.6s break duration → half-open

        // The half-open probe succeeds and the circuit closes: traffic flows again.
        (await client.GetAsync("/x")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await client.GetAsync("/x")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
