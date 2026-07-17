using System.Diagnostics;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Polly.CircuitBreaker;
using Polly.RateLimiting;
using Polly.Timeout;
using SnapAccount.Shared.Infrastructure.Resilience;
using Xunit;

namespace SnapAccount.Shared.Tests;

/// <summary>
/// Verifies IExternalCallGuard — the containment wrapper for SDK dependencies
/// that bypass HttpClientFactory (Firebase Admin verify, Google Pub/Sub, GCS):
/// breaker trips and fast-fails, concurrency is bounded, state is isolated per
/// dependency name, and the circuit recovers with the dependency.
/// </summary>
public class ExternalCallGuardTests
{
    private static ExternalCallGuard BuildGuard(Dictionary<string, string?>? extraConfig = null)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Resilience:Dependency:Default:BreakerMinimumThroughput"] = "2",
            ["Resilience:Dependency:Default:BreakerFailureRatio"] = "0.5",
            ["Resilience:Dependency:Default:BreakerSamplingSeconds"] = "5",
            ["Resilience:Dependency:Default:BreakerBreakSeconds"] = "0.6",
            ["Resilience:Dependency:Default:AttemptTimeoutSeconds"] = "1",
        };
        foreach (var (key, value) in extraConfig ?? [])
        {
            settings[key] = value;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new ExternalCallGuard(configuration, NullLogger<ExternalCallGuard>.Instance);
    }

    [Fact]
    public async Task FailingDependency_TripsBreaker_AndFastFailsWithoutCallingIt()
    {
        using var guard = BuildGuard();
        var calls = 0;
        Task<int> FailingCall(CancellationToken _) { calls++; throw new InvalidOperationException("sdk down"); }

        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-a", FailingCall));
        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-a", FailingCall));
        calls.Should().Be(2);

        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAsync<BrokenCircuitException>(() => guard.ExecuteAsync("sdk-a", FailingCall));
        stopwatch.Stop();

        calls.Should().Be(2, "an open circuit must not invoke the dependency");
        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task OpenCircuitOnOneDependency_LeavesOtherDependenciesUnaffected()
    {
        using var guard = BuildGuard();
        Task<int> Boom(CancellationToken _) => throw new InvalidOperationException("down");

        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-down", Boom));
        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-down", Boom));
        await Assert.ThrowsAsync<BrokenCircuitException>(() => guard.ExecuteAsync("sdk-down", Boom));

        var result = await guard.ExecuteAsync("sdk-healthy", _ => Task.FromResult(42));
        result.Should().Be(42, "one dependency's open circuit must never affect another");
    }

    [Fact]
    public async Task HangingDependency_IsCutOff_AtTimeout()
    {
        using var guard = BuildGuard();

        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAsync<TimeoutRejectedException>(() =>
            guard.ExecuteAsync("sdk-slow", async ct => await Task.Delay(TimeSpan.FromSeconds(30), ct)));
        stopwatch.Stop();

        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(5),
            "the 1s timeout must cut the call off long before the dependency's 30s hang");
    }

    [Fact]
    public async Task HungDependency_CannotConsumeUnboundedConcurrency()
    {
        using var guard = BuildGuard(new()
        {
            ["Resilience:Dependency:sdk-hung:MaxConcurrency"] = "2",
            ["Resilience:Dependency:sdk-hung:MaxQueuedRequests"] = "0",
            ["Resilience:Dependency:sdk-hung:AttemptTimeoutSeconds"] = "30",
        });

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = 0;
        async Task HungCall(CancellationToken _)
        {
            Interlocked.Increment(ref started);
            await gate.Task;
        }

        var inFlight1 = guard.ExecuteAsync("sdk-hung", HungCall);
        var inFlight2 = guard.ExecuteAsync("sdk-hung", HungCall);
        while (Volatile.Read(ref started) < 2)
        {
            await Task.Delay(10);
        }

        var stopwatch = Stopwatch.StartNew();
        await Assert.ThrowsAsync<RateLimiterRejectedException>(() => guard.ExecuteAsync("sdk-hung", HungCall));
        stopwatch.Stop();

        started.Should().Be(2);
        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(1));

        gate.SetResult();
        await Task.WhenAll(inFlight1, inFlight2);
    }

    [Fact]
    public async Task Breaker_ClosesAgain_WhenDependencyRecovers()
    {
        using var guard = BuildGuard();
        var healthy = false;
        Task<string> FlappyCall(CancellationToken _) =>
            healthy ? Task.FromResult("ok") : throw new InvalidOperationException("down");

        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-flappy", FlappyCall));
        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-flappy", FlappyCall));
        await Assert.ThrowsAsync<BrokenCircuitException>(() => guard.ExecuteAsync("sdk-flappy", FlappyCall)); // open

        healthy = true;
        await Task.Delay(TimeSpan.FromMilliseconds(800)); // > 0.6s break duration → half-open

        (await guard.ExecuteAsync("sdk-flappy", FlappyCall)).Should().Be("ok"); // probe closes the circuit
        (await guard.ExecuteAsync("sdk-flappy", FlappyCall)).Should().Be("ok");
    }

    [Fact]
    public async Task DisabledDependency_IsPassthrough()
    {
        using var guard = BuildGuard(new() { ["Resilience:Dependency:sdk-off:Enabled"] = "false" });
        Task<int> Boom(CancellationToken _) => throw new InvalidOperationException("down");

        // With the pipeline disabled there is no breaker: failures keep propagating unchanged.
        for (var i = 0; i < 5; i++)
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => guard.ExecuteAsync("sdk-off", Boom));
        }
    }
}
