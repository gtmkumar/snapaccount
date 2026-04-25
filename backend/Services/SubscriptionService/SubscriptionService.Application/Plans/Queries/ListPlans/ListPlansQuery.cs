using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Plans.Queries.ListPlans;

/// <summary>Lists active subscription plans available for subscription.</summary>
public record ListPlansQuery(bool IncludeInactive = false) : IQuery<IReadOnlyList<PlanDto>>;

/// <summary>Plan DTO.</summary>
public record PlanDto(
    Guid PlanId,
    string Name,
    string Tier,
    string BillingCycle,
    decimal PriceInr,
    int TrialDays,
    bool IsActive,
    string? Description);

/// <summary>Handler: lists plans.</summary>
public sealed class ListPlansQueryHandler(
    ISubscriptionServiceDbContext db) : IQueryHandler<ListPlansQuery, IReadOnlyList<PlanDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<PlanDto>>> Handle(
        ListPlansQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.Plans.Where(p => p.DeletedAt == null);

        if (!request.IncludeInactive)
            query = query.Where(p => p.IsActive);

        var plans = await query
            .OrderBy(p => p.Tier)
            .ThenBy(p => p.PriceInr)
            .Select(p => new PlanDto(
                p.Id,
                p.Name,
                p.Tier.ToString(),
                p.BillingCycle.ToString(),
                p.PriceInr,
                p.TrialDays,
                p.IsActive,
                p.Description))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<PlanDto>>.Success(plans);
    }
}
