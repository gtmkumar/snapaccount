using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Queries.ListSubscribers;

/// <summary>
/// Platform-admin subscriber list — paginated view of all organisation subscriptions.
/// Returns subscription metadata joined with plan details for the MRR dashboard and
/// admin subscriber management page (frontend: SubscriberListPage.tsx).
///
/// Note: SubscriptionService has no cross-service access to organisation display names.
/// <c>OrganizationName</c> is returned as the <c>OrganizationId</c> string representation
/// until the AuthService org-name projection is available via a read-model or an HTTP adapter.
/// The field satisfies the <c>z.string()</c> contract in subscriptionApi.ts.
/// </summary>
[RequiresPermission("subscription.plan.create")]
public record ListSubscribersQuery(
    int Page = 1,
    int PageSize = 25,
    string? StatusFilter = null,
    string? TierFilter = null) : IQuery<PaginatedResult<SubscriberRowDto>>;

/// <summary>A single subscriber row for the admin list page.</summary>
public record SubscriberRowDto(
    string SubscriptionId,
    string OrganizationId,
    /// <summary>
    /// Organisation display name. Currently the org UUID string; will be replaced with
    /// a read-model name once the AuthService→SubscriptionService org-name projection ships.
    /// </summary>
    string OrganizationName,
    string PlanId,
    string PlanName,
    string Tier,
    string Status,
    string? CurrentPeriodEnd,
    string? RazorpaySubscriptionId,
    decimal Mrr,
    DateTime CreatedAt);

/// <summary>Validates the ListSubscribersQuery.</summary>
public sealed class ListSubscribersQueryValidator : AbstractValidator<ListSubscribersQuery>
{
    /// <summary>Initialises validation rules.</summary>
    public ListSubscribersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

/// <summary>Handles <see cref="ListSubscribersQuery"/>.</summary>
public sealed class ListSubscribersQueryHandler(ISubscriptionServiceDbContext db)
    : IQueryHandler<ListSubscribersQuery, PaginatedResult<SubscriberRowDto>>
{
    /// <inheritdoc />
    public async Task<Result<PaginatedResult<SubscriberRowDto>>> Handle(
        ListSubscribersQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.DeletedAt == null);

        // Optional status filter
        if (!string.IsNullOrWhiteSpace(request.StatusFilter))
            query = query.Where(s => s.Status.ToString() == request.StatusFilter);

        // Optional plan tier filter
        if (!string.IsNullOrWhiteSpace(request.TierFilter))
            query = query.Where(s => s.Plan.Tier.ToString() == request.TierFilter);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(s => new
            {
                s.Id,
                s.OrganizationId,
                s.PlanId,
                PlanName = s.Plan.Name,
                PlanTier = s.Plan.Tier,
                s.Status,
                s.CurrentPeriodEnd,
                s.RazorpaySubscriptionId,
                PlanPriceInr = s.Plan.PriceInr,
                PlanBillingCycle = (int)s.Plan.BillingCycle,
                s.CreatedAt
            })
            .ToListAsync(cancellationToken);

        var rows = items.Select(s => new SubscriberRowDto(
            SubscriptionId:          s.Id.ToString(),
            OrganizationId:          s.OrganizationId.ToString(),
            // Return the org UUID string until org-name read-model is available (see class docs)
            OrganizationName:        s.OrganizationId.ToString(),
            PlanId:                  s.PlanId.ToString(),
            PlanName:                s.PlanName,
            Tier:                    s.PlanTier.ToString(),
            Status:                  s.Status.ToString(),
            CurrentPeriodEnd:        s.CurrentPeriodEnd.ToString("O"),
            RazorpaySubscriptionId:  s.RazorpaySubscriptionId,
            Mrr:                     s.PlanPriceInr / s.PlanBillingCycle,
            CreatedAt:               s.CreatedAt)).ToList();

        return Result<PaginatedResult<SubscriberRowDto>>.Success(
            PaginatedResult<SubscriberRowDto>.Create(rows, totalCount, request.Page, request.PageSize));
    }
}
