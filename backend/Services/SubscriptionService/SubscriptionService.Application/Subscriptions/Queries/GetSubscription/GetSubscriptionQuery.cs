using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Queries.GetSubscription;

/// <summary>Returns the active subscription for the caller's organisation.</summary>
public record GetSubscriptionQuery : IQuery<SubscriptionDto?>;

/// <summary>Subscription detail DTO.</summary>
public record SubscriptionDto(
    Guid SubscriptionId,
    Guid PlanId,
    string PlanName,
    string PlanTier,
    string BillingCycle,
    decimal PriceInr,
    string Status,
    DateTime CurrentPeriodStart,
    DateTime CurrentPeriodEnd,
    DateTime CreatedAt);

/// <summary>Handler: returns active subscription for org.</summary>
public sealed class GetSubscriptionQueryHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetSubscriptionQuery, SubscriptionDto?>
{
    /// <inheritdoc />
    public async Task<Result<SubscriptionDto?>> Handle(
        GetSubscriptionQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var sub = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.OrganizationId == orgId
                        && s.DeletedAt == null)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new SubscriptionDto(
                s.Id,
                s.PlanId,
                s.Plan.Name,
                s.Plan.Tier.ToString(),
                s.Plan.BillingCycle.ToString(),
                s.Plan.PriceInr,
                s.Status.ToString(),
                s.CurrentPeriodStart,
                s.CurrentPeriodEnd,
                s.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        return sub;
    }
}
