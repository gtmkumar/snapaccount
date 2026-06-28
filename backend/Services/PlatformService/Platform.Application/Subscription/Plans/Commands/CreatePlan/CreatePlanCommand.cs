using FluentValidation;
using Microsoft.Extensions.Logging;
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
public record CreatePlanResponse(Guid PlanId, string Name, decimal PriceInr, string? RazorpayPlanId = null);

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

/// <summary>Handler: creates a plan and optionally syncs it to Razorpay (DG-SUB-02).</summary>
public sealed class CreatePlanCommandHandler(
    ISubscriptionServiceDbContext db,
    IRazorpayClient razorpay,
    ILogger<CreatePlanCommandHandler> logger) : ICommandHandler<CreatePlanCommand, CreatePlanResponse>
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

        // DG-SUB-02: Sync plan to Razorpay when integration is enabled.
        // A Free plan (PriceInr == 0) or trial-only plan is not synced (no Razorpay plan needed for free).
        // MockRazorpayClient returns a mock_plan_* id — safe no-op when integration is disabled.
        if (request.PriceInr > 0)
        {
            try
            {
                var period = request.BillingCycle switch
                {
                    BillingCycle.Monthly   => "monthly",
                    BillingCycle.Quarterly => "monthly", // Razorpay: interval=3, period=monthly
                    BillingCycle.Annual    => "yearly",
                    _                      => "monthly"
                };
                var intervalCount = request.BillingCycle switch
                {
                    BillingCycle.Quarterly => 3,
                    _                      => 1
                };

                // Amount in paise (INR × 100).
                var amountPaise = (long)(request.PriceInr * 100);

                var result = await razorpay.SyncPlanAsync(
                    request.Name, amountPaise, period, intervalCount, cancellationToken);

                plan.SetRazorpayPlanId(result.PlanId);
                await db.SaveChangesAsync(cancellationToken);

                logger.LogInformation(
                    "Plan {PlanId} synced to Razorpay as {RazorpayPlanId}",
                    plan.Id, result.PlanId);

                return new CreatePlanResponse(plan.Id, plan.Name, plan.PriceInr, result.PlanId);
            }
            catch (Exception ex)
            {
                // Non-fatal: plan is persisted locally; Razorpay sync can be retried later
                // by re-saving the plan or running a background sync job.
                logger.LogWarning(ex,
                    "Failed to sync plan {PlanId} to Razorpay — plan saved locally, no Razorpay plan created.",
                    plan.Id);
            }
        }

        return new CreatePlanResponse(plan.Id, plan.Name, plan.PriceInr, plan.RazorpayPlanId);
    }
}
