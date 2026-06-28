using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.SelfServiceDowngrade;

/// <summary>
/// DG-SUB-04: Self-service downgrade — caller's subscription resolved server-side from
/// <see cref="ICurrentUser.OrganizationId"/>. No subscription id in the route.
/// Maps to POST /subscriptions/me/downgrade  { newPlanId }.
/// </summary>
public record SelfServiceDowngradeSubscriptionCommand(Guid NewPlanId) : ICommand<Result>;

/// <summary>Validates SelfServiceDowngradeSubscriptionCommand.</summary>
public sealed class SelfServiceDowngradeSubscriptionCommandValidator
    : AbstractValidator<SelfServiceDowngradeSubscriptionCommand>
{
    public SelfServiceDowngradeSubscriptionCommandValidator()
    {
        RuleFor(x => x.NewPlanId).NotEmpty();
    }
}

/// <summary>
/// Handler: resolves the active subscription for the caller's org and downgrades it
/// to a lower-tier plan. Change is effective immediately — billing pro-rated in real flow.
/// Returns 404 when no active subscription exists, 422 when the plan is not lower tier.
/// Mirrors DowngradeSubscriptionCommandHandler but resolves the subscription internally.
/// </summary>
public sealed class SelfServiceDowngradeSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<SelfServiceDowngradeSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        SelfServiceDowngradeSubscriptionCommand request,
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

        if (newPlan.Tier >= sub.Plan.Tier)
            return Error.Validation("Subscription.NotDowngrade",
                "New plan must have a lower tier than the current plan. Use upgrade instead.");

        // Downgrade: change plan immediately — billing pro-rated in real Razorpay flow.
        sub.ChangePlan(request.NewPlanId);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
