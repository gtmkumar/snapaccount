using Microsoft.EntityFrameworkCore;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the subscription schema database context.
/// Phase 6F: full DbSet properties wired.
/// </summary>
public interface ISubscriptionServiceDbContext
{
    /// <summary>Subscription plans (subscription.plans).</summary>
    DbSet<Plan> Plans { get; }

    /// <summary>Organisation subscriptions (subscription.subscriptions).</summary>
    DbSet<Subscription> Subscriptions { get; }

    /// <summary>Invoices (subscription.invoices).</summary>
    DbSet<Invoice> Invoices { get; }

    /// <summary>Persists changes to the subscription schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
