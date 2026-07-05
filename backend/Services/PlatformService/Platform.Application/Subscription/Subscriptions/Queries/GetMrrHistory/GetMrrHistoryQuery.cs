using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Queries.GetMrrHistory;

/// <summary>
/// DG-SUB-10: Returns a monthly MRR time-series for the past N months.
/// Used by the MRR trend line chart on the admin subscriptions dashboard.
/// Each point shows the total MRR and active-subscriber count for that calendar month.
/// Platform-admin only — requires <c>subscription.plan.create</c> permission.
/// </summary>
[RequiresPermission("subscription.plan.create")]
public record GetMrrHistoryQuery(int Months = 12) : IQuery<IReadOnlyList<MrrHistoryPointDto>>;

/// <summary>
/// A single month's MRR snapshot.
/// JSON casing matches the frontend <c>MrrHistoryPointSchema</c> in subscriptionApi.ts:
/// <c>{ month: string, totalMrr: number, activeCount: number }</c>.
/// </summary>
public record MrrHistoryPointDto(
    /// <summary>ISO 8601 year-month string, e.g. <c>"2026-05"</c>.</summary>
    string Month,
    /// <summary>Total MRR (INR) from active subscriptions during this month.</summary>
    decimal TotalMrr,
    /// <summary>Number of active subscriptions during this month.</summary>
    int ActiveCount);

/// <summary>Validates <see cref="GetMrrHistoryQuery"/>.</summary>
public sealed class GetMrrHistoryQueryValidator : AbstractValidator<GetMrrHistoryQuery>
{
    /// <summary>Initialises validation rules.</summary>
    public GetMrrHistoryQueryValidator()
    {
        RuleFor(x => x.Months).InclusiveBetween(1, 24)
            .WithMessage("Months must be between 1 and 24.");
    }
}

/// <summary>Handles <see cref="GetMrrHistoryQuery"/>.</summary>
public sealed class GetMrrHistoryQueryHandler(
    ISubscriptionServiceDbContext db)
    : IQueryHandler<GetMrrHistoryQuery, IReadOnlyList<MrrHistoryPointDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<MrrHistoryPointDto>>> Handle(
        GetMrrHistoryQuery request,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        // Load all non-deleted subscriptions that could contribute to any month in the window.
        // Include plan for billing-cycle normalisation.
        var windowStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc)
            .AddMonths(-(request.Months - 1));

        var subs = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.DeletedAt == null
                        && s.CreatedAt < now)
            .Select(s => new SubscriptionSnapshot(
                s.CreatedAt,
                s.Status,
                s.CancelledAt,
                s.Plan.PriceInr,
                (int)s.Plan.BillingCycle))
            .ToListAsync(cancellationToken);

        // Build one point per calendar month in the requested window, oldest first.
        var points = new List<MrrHistoryPointDto>(request.Months);

        for (int i = request.Months - 1; i >= 0; i--)
        {
            var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                .AddMonths(-i);
            var monthEnd = monthStart.AddMonths(1); // exclusive upper bound

            decimal mrr = 0m;
            int activeCount = 0;

            foreach (var s in subs)
            {
                // Subscription existed at some point during this month.
                if (s.CreatedAt >= monthEnd)
                    continue; // created after this month

                // Subscription was not yet cancelled at month start.
                // A cancelled subscription that was cancelled DURING this month still counts.
                bool activeDuringMonth = s.Status != SubscriptionStatus.Cancelled
                    || (s.CancelledAt.HasValue && s.CancelledAt.Value >= monthStart);

                if (!activeDuringMonth)
                    continue;

                // Normalise plan price to monthly equivalent.
                decimal monthlyMrr = s.BillingCycle > 0
                    ? s.PriceInr / s.BillingCycle
                    : s.PriceInr;

                mrr += monthlyMrr;
                activeCount++;
            }

            points.Add(new MrrHistoryPointDto(monthStart.ToString("yyyy-MM"), mrr, activeCount));
        }

        return Result<IReadOnlyList<MrrHistoryPointDto>>.Success(points);
    }
}

/// <summary>Internal projection to avoid loading full entities for the history calculation.</summary>
internal record SubscriptionSnapshot(
    DateTime CreatedAt,
    SubscriptionStatus Status,
    DateTime? CancelledAt,
    decimal PriceInr,
    int BillingCycle);
