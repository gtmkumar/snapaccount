using FluentValidation;
using Microsoft.EntityFrameworkCore;
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

/// <summary>Handler: upgrades to higher tier plan with IDOR org-scoping.</summary>
public sealed class UpgradeSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<UpgradeSubscriptionCommand, Result>
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

        sub.ChangePlan(request.NewPlanId);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
