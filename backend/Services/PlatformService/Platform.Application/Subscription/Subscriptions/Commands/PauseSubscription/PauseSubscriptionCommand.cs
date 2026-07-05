using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.PauseSubscription;

/// <summary>
/// DG-SUB-11: Pauses an active subscription.
/// Invokes <see cref="Domain.Entities.Subscription.Pause"/> on the aggregate.
/// Only ACTIVE or TRIALING subscriptions may be paused.
/// Admin route — the subscription is identified by explicit <c>id</c>.
/// Permission: subscription.manage (platform-admin).
/// </summary>
[RequiresPermission("subscription.manage")]
public record PauseSubscriptionCommand(Guid SubscriptionId) : ICommand<Result>;

/// <summary>Validates <see cref="PauseSubscriptionCommand"/>.</summary>
public sealed class PauseSubscriptionCommandValidator : AbstractValidator<PauseSubscriptionCommand>
{
    public PauseSubscriptionCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
    }
}

/// <summary>Handles <see cref="PauseSubscriptionCommand"/>.</summary>
public sealed class PauseSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ILogger<PauseSubscriptionCommandHandler> logger)
    : ICommandHandler<PauseSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        PauseSubscriptionCommand request,
        CancellationToken cancellationToken)
    {
        var sub = await db.Subscriptions
            .Where(s => s.Id == request.SubscriptionId && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription", request.SubscriptionId);

        if (sub.Status is not (SubscriptionStatus.Active or SubscriptionStatus.Trialing))
            return Error.Validation("Subscription.CannotPause",
                $"Only Active or Trialing subscriptions can be paused. Current status: {sub.Status}.");

        sub.Pause();
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Subscription {SubscriptionId} paused for org {OrgId}.",
            sub.Id, sub.OrganizationId);

        return Result.Success();
    }
}
