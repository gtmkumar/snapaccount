using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.Subscribe;

/// <summary>Subscribes an organisation to a plan.</summary>
public record SubscribeCommand(
    Guid PlanId,
    string? RazorpaySubscriptionId = null,
    string? RazorpayCustomerId = null) : ICommand<SubscribeResponse>;

/// <summary>Response after subscribing.</summary>
public record SubscribeResponse(
    Guid SubscriptionId,
    string Status,
    DateTime CurrentPeriodEnd);

/// <summary>Validates SubscribeCommand.</summary>
public sealed class SubscribeCommandValidator : AbstractValidator<SubscribeCommand>
{
    public SubscribeCommandValidator()
    {
        RuleFor(x => x.PlanId).NotEmpty();
        RuleFor(x => x.RazorpaySubscriptionId).MaximumLength(100).When(x => x.RazorpaySubscriptionId != null);
    }
}

/// <summary>Handler: creates a subscription, cancels any existing active one.</summary>
public sealed class SubscribeCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<SubscribeCommand, SubscribeResponse>
{
    /// <inheritdoc />
    public async Task<Result<SubscribeResponse>> Handle(
        SubscribeCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var plan = await db.Plans
            .Where(p => p.Id == request.PlanId && p.IsActive && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (plan == null)
            return Error.NotFound("Plan", request.PlanId);

        // Cancel any existing active/trialing subscription for this org
        var existing = await db.Subscriptions
            .Where(s => s.OrganizationId == orgId
                        && s.Status != SubscriptionStatus.Cancelled
                        && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        existing?.Cancel();

        var subscription = Subscription.Create(
            orgId.Value,
            plan.Id,
            plan.TrialDays,
            request.RazorpaySubscriptionId,
            request.RazorpayCustomerId);

        db.Subscriptions.Add(subscription);
        await db.SaveChangesAsync(cancellationToken);

        return new SubscribeResponse(
            subscription.Id,
            subscription.Status.ToString(),
            subscription.CurrentPeriodEnd);
    }
}
