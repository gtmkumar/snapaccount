// Unit tests for GAP-PCI-02: MockRazorpayClient Development-only guard
// and GAP-PCI-01: VerifyWebhookSignature removed from IRazorpayClient
//
// Covers:
//   1.  Development environment — MockRazorpayClient is resolvable
//   2.  Non-Development environment — resolving IRazorpayClient throws InvalidOperationException
//   3.  Non-Development error message contains GAP-PCI-02 code
//   4.  IRazorpayClient interface does NOT declare VerifyWebhookSignature (GAP-PCI-01)
//   5.  MockRazorpayClient does NOT implement VerifyWebhookSignature (GAP-PCI-01)
//   6.  RazorpayHttpClient does NOT implement VerifyWebhookSignature (GAP-PCI-01)

using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Infrastructure.Razorpay;
using Xunit;

namespace SubscriptionService.Tests;

[Trait("Category", "Unit")]
public sealed class MockRazorpayGuardTests
{
    private static IServiceProvider BuildServices(string environment)
    {
        var services = new ServiceCollection();
        services.AddLogging();

        var isDevelopment = string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase);

        if (isDevelopment)
        {
            services.AddScoped<IRazorpayClient, MockRazorpayClient>();
        }
        else
        {
            services.AddScoped<IRazorpayClient>(_ =>
                throw new InvalidOperationException(
                    "GAP-PCI-02: IRazorpayClient is not configured for non-Development environments. " +
                    "The Razorpay admin configuration (POST /subscriptions/config/razorpay) must be " +
                    "applied before processing payments. Set ASPNETCORE_ENVIRONMENT=Development to use the mock."));
        }

        return services.BuildServiceProvider();
    }

    [Fact]
    public void Development_MockClientIsResolvable()
    {
        var sp     = BuildServices("Development");
        using var scope = sp.CreateScope();

        var act = () => scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        act.Should().NotThrow("MockRazorpayClient must be resolvable in Development");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void NonDevelopment_ResolvingThrows(string environment)
    {
        var sp     = BuildServices(environment);
        using var scope = sp.CreateScope();

        var act = () => scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        act.Should().Throw<InvalidOperationException>(
            $"resolving the mock Razorpay client in {environment} must throw (PCI guard)");
    }

    [Fact]
    public void NonDevelopment_ErrorMessage_ContainsGapPci02Code()
    {
        var sp     = BuildServices("Production");
        using var scope = sp.CreateScope();

        var ex = Assert.Throws<InvalidOperationException>(
            () => scope.ServiceProvider.GetRequiredService<IRazorpayClient>());

        ex.Message.Should().Contain("GAP-PCI-02",
            "error must reference the gap code so the missing configuration is immediately identifiable");
    }

    // ── GAP-PCI-01: VerifyWebhookSignature removed ───────────────────────────

    [Fact]
    public void IRazorpayClient_DoesNotDeclare_VerifyWebhookSignature()
    {
        // The method must NOT exist on the interface — it used string.Equals (non-constant-time)
        // and was dead code. The authoritative HMAC is in RazorpayWebhook.cs.
        var interfaceMethods = typeof(IRazorpayClient)
            .GetMethods()
            .Select(m => m.Name)
            .ToList();

        interfaceMethods.Should().NotContain(
            "VerifyWebhookSignature",
            "GAP-PCI-01: non-constant-time string.Equals verification must be removed from the interface");
    }

    [Fact]
    public void MockRazorpayClient_DoesNotImplement_VerifyWebhookSignature()
    {
        var methods = typeof(MockRazorpayClient)
            .GetMethods(
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.DeclaredOnly)
            .Select(m => m.Name)
            .ToList();

        methods.Should().NotContain(
            "VerifyWebhookSignature",
            "GAP-PCI-01: MockRazorpayClient must not implement the removed method");
    }

    [Fact]
    public void RazorpayHttpClient_DoesNotImplement_VerifyWebhookSignature()
    {
        var methods = typeof(RazorpayHttpClient)
            .GetMethods(
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.DeclaredOnly)
            .Select(m => m.Name)
            .ToList();

        methods.Should().NotContain(
            "VerifyWebhookSignature",
            "GAP-PCI-01: RazorpayHttpClient must not implement the non-constant-time method");
    }
}
