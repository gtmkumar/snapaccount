using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SubscriptionService.Infrastructure.Persistence;

namespace SubscriptionService.Tests;

/// <summary>
/// EF model smoke tests for SubscriptionService — validates that the EF Core model can
/// generate SQL for every DbSet without schema errors.
///
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// These tests catch EF↔DB divergences (BUG: Subscription entity mapped AnonymizationReason
/// which does not exist in subscription.subscription table).
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class SubscriptionEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static SubscriptionServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SubscriptionServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new SubscriptionServiceDbContext(options);
    }

    [Fact]
    public async Task Plans_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Plans.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for subscription.subscription_plan must be correct");
    }

    [Fact]
    public async Task Subscriptions_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Subscriptions.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for subscription.subscription must be correct (BUG-FIX: AnonymizationReason was mapped to non-existent column)");
    }

    [Fact]
    public async Task Invoices_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Invoices.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for subscription.subscription_invoice must be correct");
    }

    [Fact]
    public async Task RazorpayConfigs_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.RazorpayConfigs.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for subscription.razorpay_config must be correct");
    }

    [Fact]
    public async Task UsageRecords_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.UsageRecords.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for subscription.usage_record must be correct");
    }
}
