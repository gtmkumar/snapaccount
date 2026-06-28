using AuthService.Application.Common.Interfaces;
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
/// DG-SUB-12: OrganizationName is now resolved from <c>auth.organizations.business_name</c>
/// via <see cref="IAuthDbContext"/> (both modules share the same PostgreSQL connection).
/// GSTIN is also resolved from <c>auth.organizations.gstin</c>.
/// Both are fetched in a single IN-clause batch lookup keyed on the org UUIDs in the page.
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
    /// DG-SUB-12: Organisation display name resolved from auth.organizations.business_name.
    /// Falls back to org UUID string when the org row is missing (e.g. test data).
    /// </summary>
    string OrganizationName,
    /// <summary>
    /// DG-SUB-12: GSTIN resolved from auth.organizations.gstin (nullable — not all orgs are GST-registered).
    /// </summary>
    string? Gstin,
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
public sealed class ListSubscribersQueryHandler(
    ISubscriptionServiceDbContext db,
    IAuthDbContext authDb)
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

        // DG-SUB-12: Batch-resolve org names + GSTIN from auth.organizations.
        // Single IN-clause query; no N+1.
        var orgIds = items.Select(s => s.OrganizationId).Distinct().ToList();

        var orgLookup = await authDb.Organizations
            .Where(o => orgIds.Contains(o.Id) && o.DeletedAt == null)
            .Select(o => new { o.Id, o.BusinessName, o.Gstin })
            .ToDictionaryAsync(o => o.Id, cancellationToken);

        var rows = items.Select(s =>
        {
            var orgFound = orgLookup.TryGetValue(s.OrganizationId, out var org);
            return new SubscriberRowDto(
                SubscriptionId:         s.Id.ToString(),
                OrganizationId:         s.OrganizationId.ToString(),
                // DG-SUB-12: resolved name; fall back to UUID string if org not found (test data).
                OrganizationName:       orgFound ? org!.BusinessName : s.OrganizationId.ToString(),
                // DG-SUB-12: GSTIN from auth schema (nullable — not all orgs are GST-registered).
                Gstin:                  orgFound ? org!.Gstin : null,
                PlanId:                 s.PlanId.ToString(),
                PlanName:               s.PlanName,
                Tier:                   s.PlanTier.ToString(),
                Status:                 s.Status.ToString(),
                CurrentPeriodEnd:       s.CurrentPeriodEnd.ToString("O"),
                RazorpaySubscriptionId: s.RazorpaySubscriptionId,
                Mrr:                    s.PlanPriceInr / s.PlanBillingCycle,
                CreatedAt:              s.CreatedAt);
        }).ToList();

        return Result<PaginatedResult<SubscriberRowDto>>.Success(
            PaginatedResult<SubscriberRowDto>.Create(rows, totalCount, request.Page, request.PageSize));
    }
}
