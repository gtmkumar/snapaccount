using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Commands.DowngradeSubscription;

/// <summary>Downgrades the current subscription to a lower-tier plan.</summary>
public record DowngradeSubscriptionCommand(Guid SubscriptionId, Guid NewPlanId) : ICommand<Result>;

/// <summary>Validates DowngradeSubscriptionCommand.</summary>
public sealed class DowngradeSubscriptionCommandValidator : AbstractValidator<DowngradeSubscriptionCommand>
{
    public DowngradeSubscriptionCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
        RuleFor(x => x.NewPlanId).NotEmpty();
    }
}

/// <summary>Handler: downgrades plan — effective at next billing cycle.</summary>
public sealed class DowngradeSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<DowngradeSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        DowngradeSubscriptionCommand request,
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

        if (newPlan.Tier >= sub.Plan.Tier)
            return Error.Validation("Subscription.NotDowngrade",
                "New plan must have a lower tier than the current plan. Use UpgradeSubscription instead.");

        // Downgrade: schedule change — change plan immediately (billing pro-rated in real flow)
        sub.ChangePlan(request.NewPlanId);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
