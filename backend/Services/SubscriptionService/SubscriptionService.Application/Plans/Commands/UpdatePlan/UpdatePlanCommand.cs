using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Plans.Commands.UpdatePlan;

/// <summary>Updates an existing plan (admin only).</summary>
[RequiresPermission("subscription.plan.update")]
public record UpdatePlanCommand(
    Guid PlanId,
    string Name,
    decimal PriceInr,
    string? Description,
    bool IsActive) : ICommand<Result>;

/// <summary>Validates UpdatePlanCommand.</summary>
public sealed class UpdatePlanCommandValidator : AbstractValidator<UpdatePlanCommand>
{
    public UpdatePlanCommandValidator()
    {
        RuleFor(x => x.PlanId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PriceInr).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Description).MaximumLength(2000).When(x => x.Description != null);
    }
}

/// <summary>Handler: updates plan.</summary>
public sealed class UpdatePlanCommandHandler(
    ISubscriptionServiceDbContext db) : ICommandHandler<UpdatePlanCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        UpdatePlanCommand request,
        CancellationToken cancellationToken)
    {
        var plan = await db.Plans
            .Where(p => p.Id == request.PlanId && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (plan == null)
            return Error.NotFound("Plan", request.PlanId);

        plan.Update(request.Name, request.PriceInr, request.Description, request.IsActive);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
