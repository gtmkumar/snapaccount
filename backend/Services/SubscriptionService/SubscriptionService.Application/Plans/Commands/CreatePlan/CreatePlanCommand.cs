using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Plans.Commands.CreatePlan;

/// <summary>Creates a new subscription plan (admin only).</summary>
[RequiresPermission("subscription.plan.create")]
public record CreatePlanCommand(
    string Name,
    PlanTier Tier,
    BillingCycle BillingCycle,
    decimal PriceInr,
    int TrialDays = 0,
    string? Description = null) : ICommand<CreatePlanResponse>;

/// <summary>Response after creating a plan.</summary>
public record CreatePlanResponse(Guid PlanId, string Name, decimal PriceInr);

/// <summary>Validates CreatePlanCommand.</summary>
public sealed class CreatePlanCommandValidator : AbstractValidator<CreatePlanCommand>
{
    public CreatePlanCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Tier).IsInEnum();
        RuleFor(x => x.BillingCycle).IsInEnum();
        RuleFor(x => x.PriceInr).GreaterThanOrEqualTo(0);
        RuleFor(x => x.TrialDays).InclusiveBetween(0, 90);
        RuleFor(x => x.Description).MaximumLength(2000).When(x => x.Description != null);
    }
}

/// <summary>Handler: creates a plan.</summary>
public sealed class CreatePlanCommandHandler(
    ISubscriptionServiceDbContext db) : ICommandHandler<CreatePlanCommand, CreatePlanResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreatePlanResponse>> Handle(
        CreatePlanCommand request,
        CancellationToken cancellationToken)
    {
        var plan = Plan.Create(
            request.Name, request.Tier, request.BillingCycle,
            request.PriceInr, request.TrialDays, request.Description);

        db.Plans.Add(plan);
        await db.SaveChangesAsync(cancellationToken);

        return new CreatePlanResponse(plan.Id, plan.Name, plan.PriceInr);
    }
}
