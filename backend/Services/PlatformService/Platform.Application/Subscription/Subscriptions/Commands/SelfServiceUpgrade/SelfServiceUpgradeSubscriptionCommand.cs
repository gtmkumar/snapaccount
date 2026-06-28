using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.SelfServiceUpgrade;

/// <summary>
/// DG-SUB-04: Self-service upgrade — caller's subscription resolved server-side from
/// <see cref="ICurrentUser.OrganizationId"/>. No subscription id in the route.
/// Maps to POST /subscriptions/me/upgrade  { newPlanId }.
/// </summary>
public record SelfServiceUpgradeSubscriptionCommand(Guid NewPlanId) : ICommand<Result>;

/// <summary>Validates SelfServiceUpgradeSubscriptionCommand.</summary>
public sealed class SelfServiceUpgradeSubscriptionCommandValidator
    : AbstractValidator<SelfServiceUpgradeSubscriptionCommand>
{
    public SelfServiceUpgradeSubscriptionCommandValidator()
    {
        RuleFor(x => x.NewPlanId).NotEmpty();
    }
}

/// <summary>
/// Handler: resolves the active subscription for the caller's org and upgrades it
/// to a higher-tier plan. Returns 404 when no active subscription exists, 422 when
/// the requested plan is not a higher tier.
/// Mirrors UpgradeSubscriptionCommandHandler but resolves the subscription internally
/// rather than accepting an explicit subscription id.
/// </summary>
public sealed class SelfServiceUpgradeSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser,
    IRazorpayClient razorpay,
    ILogger<SelfServiceUpgradeSubscriptionCommandHandler> logger)
    : ICommandHandler<SelfServiceUpgradeSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        SelfServiceUpgradeSubscriptionCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var sub = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.OrganizationId == orgId
                        && s.DeletedAt == null
                        && s.Status != SubscriptionStatus.Cancelled)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub is null)
            return Error.NotFound("Subscription.NotFound", "This organisation has no active subscription.");

        var newPlan = await db.Plans
            .Where(p => p.Id == request.NewPlanId && p.IsActive && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (newPlan is null)
            return Error.NotFound("Plan", request.NewPlanId);

        if (newPlan.Tier <= sub.Plan.Tier)
            return Error.Validation("Subscription.NotUpgrade",
                "New plan must have a higher tier than the current plan. Use downgrade instead.");

        // DG-SUB-02: For paid plans with a Razorpay plan ID, create a new Razorpay subscription.
        if (newPlan.PriceInr > 0 && newPlan.RazorpayPlanId is not null)
        {
            try
            {
                var subResult = await razorpay.CreateSubscriptionAsync(
                    newPlan.RazorpayPlanId,
                    totalCount: 0,
                    notes: new Dictionary<string, string>
                    {
                        ["org_id"]       = orgId.Value.ToString(),
                        ["plan_id"]      = newPlan.Id.ToString(),
                        ["plan_name"]    = newPlan.Name,
                        ["upgrade_from"] = sub.PlanId.ToString(),
                    },
                    cancellationToken);

                sub.SetRazorpaySubscriptionId(subResult.SubscriptionId);

                logger.LogInformation(
                    "Razorpay subscription {RazorpaySubId} created for self-service upgrade: " +
                    "org {OrgId}, old plan {OldPlanId} → new plan {NewPlanId}",
                    subResult.SubscriptionId, orgId.Value, sub.PlanId, newPlan.Id);
            }
            catch (Exception ex)
            {
                // Non-fatal: plan change is persisted locally; Razorpay billing follows via webhook.
                logger.LogWarning(ex,
                    "Failed to create Razorpay subscription for self-service upgrade " +
                    "(org {OrgId}, plan {PlanId}) — plan changed locally.",
                    orgId.Value, newPlan.Id);
            }
        }

        sub.ChangePlan(request.NewPlanId);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
