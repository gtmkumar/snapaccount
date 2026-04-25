using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence;

/// <summary>EF Core DbContext for the subscription schema. Phase 6F: all entities wired.</summary>
public class SubscriptionServiceDbContext(DbContextOptions<SubscriptionServiceDbContext> options)
    : BaseDbContext(options), ISubscriptionServiceDbContext
{
    /// <inheritdoc />
    public DbSet<Plan> Plans => Set<Plan>();

    /// <inheritdoc />
    public DbSet<Subscription> Subscriptions => Set<Subscription>();

    /// <inheritdoc />
    public DbSet<Invoice> Invoices => Set<Invoice>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("subscription");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SubscriptionServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
