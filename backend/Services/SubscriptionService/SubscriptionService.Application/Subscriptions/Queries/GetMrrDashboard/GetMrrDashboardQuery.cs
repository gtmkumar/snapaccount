using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Queries.GetMrrDashboard;

/// <summary>Returns MRR (Monthly Recurring Revenue) dashboard metrics (admin only).</summary>
[RequiresPermission("subscription.plan.create")]
public record GetMrrDashboardQuery : IQuery<MrrDashboardDto>;

/// <summary>MRR dashboard DTO.</summary>
public record MrrDashboardDto(
    decimal TotalMrr,
    int ActiveSubscriptions,
    int TrialingSubscriptions,
    int PastDueSubscriptions,
    int CancelledThisMonth,
    IReadOnlyList<PlanMrrDto> ByPlan);

/// <summary>MRR breakdown per plan.</summary>
public record PlanMrrDto(
    string PlanName,
    string Tier,
    int SubscriberCount,
    decimal Mrr);

/// <summary>Handler: computes MRR dashboard metrics.</summary>
public sealed class GetMrrDashboardQueryHandler(
    ISubscriptionServiceDbContext db) : IQueryHandler<GetMrrDashboardQuery, MrrDashboardDto>
{
    /// <inheritdoc />
    public async Task<Result<MrrDashboardDto>> Handle(
        GetMrrDashboardQuery request,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var activeStatuses = new[] { SubscriptionStatus.Active, SubscriptionStatus.Trialing };

        // Active subscription summary
        var activeSubs = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => activeStatuses.Contains(s.Status) && s.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var totalMrr = activeSubs
            .Where(s => s.Status == SubscriptionStatus.Active)
            .Sum(s => s.Plan.PriceInr / (int)s.Plan.BillingCycle);

        var pastDueCount = await db.Subscriptions
            .CountAsync(s => s.Status == SubscriptionStatus.PastDue && s.DeletedAt == null, cancellationToken);

        var cancelledThisMonth = await db.Subscriptions
            .CountAsync(s => s.Status == SubscriptionStatus.Cancelled
                             && s.CancelledAt >= monthStart
                             && s.DeletedAt == null, cancellationToken);

        var byPlan = activeSubs
            .Where(s => s.Status == SubscriptionStatus.Active)
            .GroupBy(s => s.Plan)
            .Select(g => new PlanMrrDto(
                g.Key.Name,
                g.Key.Tier.ToString(),
                g.Count(),
                g.Sum(s => s.Plan.PriceInr / (int)s.Plan.BillingCycle)))
            .ToList();

        return new MrrDashboardDto(
            totalMrr,
            activeSubs.Count(s => s.Status == SubscriptionStatus.Active),
            activeSubs.Count(s => s.Status == SubscriptionStatus.Trialing),
            pastDueCount,
            cancelledThisMonth,
            byPlan);
    }
}
