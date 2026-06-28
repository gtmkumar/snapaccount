using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.UpgradeSubscription;

/// <summary>Upgrades the current subscription to a higher-tier plan.</summary>
public record UpgradeSubscriptionCommand(Guid SubscriptionId, Guid NewPlanId) : ICommand<Result>;

/// <summary>Validates UpgradeSubscriptionCommand.</summary>
public sealed class UpgradeSubscriptionCommandValidator : AbstractValidator<UpgradeSubscriptionCommand>
{
    public UpgradeSubscriptionCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
        RuleFor(x => x.NewPlanId).NotEmpty();
    }
}

/// <summary>
/// Handler: upgrades to higher tier plan with IDOR org-scoping.
/// When Razorpay integration is enabled and the new plan has a Razorpay plan ID,
/// creates a new Razorpay subscription and updates the local record (DG-SUB-02).
/// </summary>
public sealed class UpgradeSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser,
    IRazorpayClient razorpay,
    ILogger<UpgradeSubscriptionCommandHandler> logger) : ICommandHandler<UpgradeSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        UpgradeSubscriptionCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var sub = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.Id == request.SubscriptionId && s.OrganizationId == orgId && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription", request.SubscriptionId);

        var newPlan = await db.Plans
            .Where(p => p.Id == request.NewPlanId && p.IsActive && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (newPlan == null)
            return Error.NotFound("Plan", request.NewPlanId);

        if (newPlan.Tier <= sub.Plan.Tier)
            return Error.Validation("Subscription.NotUpgrade",
                "New plan must have a higher tier than the current plan. Use DowngradeSubscription instead.");

        // DG-SUB-02: For paid plans with a Razorpay plan ID, create a new Razorpay subscription
        // for the upgraded plan. The existing subscription on the old plan will be cancelled
        // by Razorpay automatically when the new subscription is activated.
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
                    "Razorpay subscription {RazorpaySubId} created for upgrade: org {OrgId}, " +
                    "old plan {OldPlanId} → new plan {NewPlanId}",
                    subResult.SubscriptionId, orgId.Value, sub.PlanId, newPlan.Id);
            }
            catch (Exception ex)
            {
                // Non-fatal: plan change is persisted locally; Razorpay billing follows via webhook.
                logger.LogWarning(ex,
                    "Failed to create Razorpay subscription for upgrade (org {OrgId}, plan {PlanId}) — " +
                    "plan changed locally without new Razorpay subscription.",
                    orgId.Value, newPlan.Id);
            }
        }

        sub.ChangePlan(request.NewPlanId);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
