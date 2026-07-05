using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Queries.GetProrationPreview;

/// <summary>
/// DG-SUB-08: Returns a proration preview for upgrading or downgrading the current subscription
/// to a different plan mid-cycle.
///
/// Proration formula:
/// <code>
/// daysRemaining   = (CurrentPeriodEnd - Now).TotalDays  (clamped to ≥ 0)
/// totalDays       = (CurrentPeriodEnd - CurrentPeriodStart).TotalDays  (clamped to ≥ 1)
/// unusedCredit    = currentPlan.PriceInr × (daysRemaining / totalDays)
/// chargeToday     = Max(0, newPlan.PriceInr - unusedCredit)   (with GST 18%)
/// nextRenewalAmt  = newPlan.PriceInr × 1.18  (full cycle at next renewal)
/// </code>
/// All amounts are in INR (decimal precision). GST 18% is applied on the SaaS
/// subscription base price per Indian compliance rules.
///
/// Route: GET /subscriptions/me/proration-preview?newPlanId={guid}
/// Permission: none extra (authenticated org owner/admin can preview).
/// </summary>
[RequiresPermission("subscription.read")]
public record GetProrationPreviewQuery(Guid NewPlanId) : IQuery<ProrationPreviewDto>;

/// <summary>Proration preview response for the upgrade/downgrade dialog.</summary>
public record ProrationPreviewDto(
    /// <summary>Display name of the current plan.</summary>
    string CurrentPlanName,
    /// <summary>Display name of the new plan.</summary>
    string NewPlanName,
    /// <summary>Days remaining in the current billing period.</summary>
    decimal DaysRemaining,
    /// <summary>Total days in the current billing period.</summary>
    decimal TotalDays,
    /// <summary>Credit for the unused portion of the current period (excl. GST).</summary>
    decimal UnusedCreditInr,
    /// <summary>Amount due today after applying unused credit (excl. GST).</summary>
    decimal ChargeTodayExclGstInr,
    /// <summary>GST (18%) on the charge today.</summary>
    decimal ChargeTodayGstInr,
    /// <summary>Total amount due today (incl. GST).</summary>
    decimal ChargeTodayTotalInr,
    /// <summary>Full next-cycle renewal amount (incl. GST).</summary>
    decimal NextRenewalTotalInr,
    /// <summary>ISO-8601 next renewal date (CurrentPeriodEnd).</summary>
    string NextRenewalDate,
    /// <summary>True when the new plan is a downgrade (lower price).</summary>
    bool IsDowngrade);

/// <summary>Validates <see cref="GetProrationPreviewQuery"/>.</summary>
public sealed class GetProrationPreviewQueryValidator : AbstractValidator<GetProrationPreviewQuery>
{
    public GetProrationPreviewQueryValidator()
    {
        RuleFor(x => x.NewPlanId).NotEmpty();
    }
}

/// <summary>Handles <see cref="GetProrationPreviewQuery"/>.</summary>
public sealed class GetProrationPreviewQueryHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetProrationPreviewQuery, ProrationPreviewDto>
{
    private const decimal GstRate = 0.18m;

    /// <inheritdoc />
    public async Task<Result<ProrationPreviewDto>> Handle(
        GetProrationPreviewQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        // Load current subscription with plan details
        var sub = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.OrganizationId == orgId && s.DeletedAt == null
                        && s.Status != SubscriptionService.Domain.Enums.SubscriptionStatus.Cancelled)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription.NotFound", "No active subscription found for this organisation.");

        // Load the target plan
        var newPlan = await db.Plans
            .Where(p => p.Id == request.NewPlanId && p.IsActive && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (newPlan == null)
            return Error.NotFound("Plan.NotFound", $"Plan {request.NewPlanId} not found or is inactive.");

        if (newPlan.Id == sub.PlanId)
            return Error.Validation("Subscription.SamePlan", "The new plan must be different from the current plan.");

        // ── Proration calculation ────────────────────────────────────────────
        var now = DateTime.UtcNow;
        var periodEnd = sub.CurrentPeriodEnd;
        var periodStart = sub.CurrentPeriodStart;

        var totalDays = Math.Max(1m, (decimal)(periodEnd - periodStart).TotalDays);
        var daysRemaining = Math.Max(0m, (decimal)(periodEnd - now).TotalDays);

        // Unused credit: fraction of current plan price for remaining days
        var unusedCreditInr = Math.Round(sub.Plan.PriceInr * (daysRemaining / totalDays), 2);

        // Charge today: new plan price minus unused credit (floor at 0)
        var chargeTodayExclGst = Math.Max(0m, Math.Round(newPlan.PriceInr - unusedCreditInr, 2));
        var chargeTodayGst = Math.Round(chargeTodayExclGst * GstRate, 2);
        var chargeTodayTotal = chargeTodayExclGst + chargeTodayGst;

        // Next renewal: full new plan price + GST
        var nextRenewalTotal = Math.Round(newPlan.PriceInr * (1 + GstRate), 2);

        var isDowngrade = newPlan.PriceInr < sub.Plan.PriceInr;

        return new ProrationPreviewDto(
            CurrentPlanName:          sub.Plan.Name,
            NewPlanName:              newPlan.Name,
            DaysRemaining:            Math.Round(daysRemaining, 1),
            TotalDays:                Math.Round(totalDays, 1),
            UnusedCreditInr:          unusedCreditInr,
            ChargeTodayExclGstInr:    chargeTodayExclGst,
            ChargeTodayGstInr:        chargeTodayGst,
            ChargeTodayTotalInr:      chargeTodayTotal,
            NextRenewalTotalInr:      nextRenewalTotal,
            NextRenewalDate:          periodEnd.ToString("O"),
            IsDowngrade:              isDowngrade);
    }
}
