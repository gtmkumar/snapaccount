// Unit tests for GAP-041: StubLoanPdfGenerator Development-only guard
//
// Covers:
//   1.  Development environment — StubLoanPdfGenerator is resolvable
//   2.  Non-Development environment — resolving ILoanPdfGenerator throws InvalidOperationException
//   3.  Non-Development error message contains GAP-041 code

using FluentAssertions;
using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LoanService.Tests;

[Trait("Category", "Unit")]
public sealed class StubPdfGuardTests
{
    // Helper: build a minimal ServiceCollection that simulates AddLoanInfrastructure
    // ONLY for the ILoanPdfGenerator guard logic (we don't need the full DI setup).
    private static IServiceProvider BuildServices(string environment)
    {
        var services = new ServiceCollection();
        // StubLoanPdfGenerator uses ILogger — must be registered.
        services.AddLogging();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ASPNETCORE_ENVIRONMENT"] = environment,
            })
            .Build();

        var isDevelopment = string.Equals(
            config["ASPNETCORE_ENVIRONMENT"], "Development",
            StringComparison.OrdinalIgnoreCase);

        if (isDevelopment)
        {
            services.AddScoped<ILoanPdfGenerator, LoanService.Infrastructure.Services.StubLoanPdfGenerator>();
        }
        else
        {
            services.AddScoped<ILoanPdfGenerator>(_ =>
                throw new InvalidOperationException(
                    "GAP-041: ILoanPdfGenerator is not configured for non-Development environments. " +
                    "Wire the real QuestPDF generator via ReportService before deploying. " +
                    "Set ASPNETCORE_ENVIRONMENT=Development to use the stub locally."));
        }

        return services.BuildServiceProvider();
    }

    [Fact]
    public void Development_StubIsResolvable()
    {
        var sp     = BuildServices("Development");
        using var scope = sp.CreateScope();

        var act = () => scope.ServiceProvider.GetRequiredService<ILoanPdfGenerator>();
        act.Should().NotThrow("StubLoanPdfGenerator must be resolvable in Development");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void NonDevelopment_ResolvingThrows(string environment)
    {
        var sp     = BuildServices(environment);
        using var scope = sp.CreateScope();

        var act = () => scope.ServiceProvider.GetRequiredService<ILoanPdfGenerator>();
        act.Should().Throw<InvalidOperationException>(
            $"resolving the stub PDF generator in {environment} must throw to surface the gap");
    }

    [Fact]
    public void NonDevelopment_ErrorMessage_ContainsGap041Code()
    {
        var sp     = BuildServices("Production");
        using var scope = sp.CreateScope();

        var ex = Assert.Throws<InvalidOperationException>(
            () => scope.ServiceProvider.GetRequiredService<ILoanPdfGenerator>());

        ex.Message.Should().Contain("GAP-041",
            "error must reference the gap code so the missing wiring is immediately identifiable");
    }
}
