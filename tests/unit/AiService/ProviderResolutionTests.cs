using AiService.Application.Common.Interfaces;
using AiService.Infrastructure.Providers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

/// <summary>
/// Tests for <see cref="AiProviderResolver"/> — ensures correct fallback to mock
/// when AuthService is unreachable or provider has no API key.
/// Architecture decision §7: MockAiProvider is the default when no config available.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ProviderResolutionTests
{
    private static AiProviderResolver BuildResolver(string? serviceUrl = null)
    {
        // Use an HttpClient that will fail (no real server in unit tests).
        var http = new System.Net.Http.HttpClient
        {
            BaseAddress = new Uri(serviceUrl ?? "http://localhost:59999/") // unreachable
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ServiceUrls:AuthService"] = "http://localhost:59999"
            })
            .Build();

        var mock = new MockAiProvider(NullLogger<MockAiProvider>.Instance);

        return new AiProviderResolver(
            http, config, mock,
            new NullLoggerFactory(), NullLogger<AiProviderResolver>.Instance);
    }

    [Fact]
    public async Task ResolveAsync_WhenAuthServiceUnreachable_ReturnsMockProvider()
    {
        var resolver = BuildResolver();
        var resolved = await resolver.ResolveAsync("invoice_extract");

        resolved.Provider.ProviderId.Should().Be("mock");
        resolved.EffectiveModel.Should().Contain("mock");
    }

    [Fact]
    public async Task ResolveAsync_DifferentFeatureCodes_BothFallToMock()
    {
        var resolver = BuildResolver();

        var r1 = await resolver.ResolveAsync("invoice_extract");
        var r2 = await resolver.ResolveAsync("chat_qa");
        var r3 = await resolver.ResolveAsync("rag_embed");

        r1.Provider.ProviderId.Should().Be("mock");
        r2.Provider.ProviderId.Should().Be("mock");
        r3.Provider.ProviderId.Should().Be("mock");
    }

    [Fact]
    public async Task ResolveAsync_MockProvider_IsReusedAcrossCalls()
    {
        var resolver = BuildResolver();

        var r1 = await resolver.ResolveAsync("invoice_extract");
        var r2 = await resolver.ResolveAsync("invoice_extract");

        // Same mock singleton instance should be returned.
        r1.Provider.Should().BeSameAs(r2.Provider);
    }
}
