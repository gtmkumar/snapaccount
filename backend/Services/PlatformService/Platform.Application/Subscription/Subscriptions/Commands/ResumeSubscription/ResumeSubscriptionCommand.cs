using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.ResumeSubscription;

/// <summary>
/// DG-SUB-11: Resumes a paused subscription.
/// Invokes <see cref="Domain.Entities.Subscription.Resume"/> on the aggregate.
/// Only PAUSED subscriptions may be resumed.
/// Admin route — the subscription is identified by explicit <c>id</c>.
/// Permission: subscription.manage (platform-admin).
/// </summary>
[RequiresPermission("subscription.manage")]
public record ResumeSubscriptionCommand(Guid SubscriptionId) : ICommand<Result>;

/// <summary>Validates <see cref="ResumeSubscriptionCommand"/>.</summary>
public sealed class ResumeSubscriptionCommandValidator : AbstractValidator<ResumeSubscriptionCommand>
{
    public ResumeSubscriptionCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
    }
}

/// <summary>Handles <see cref="ResumeSubscriptionCommand"/>.</summary>
public sealed class ResumeSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ILogger<ResumeSubscriptionCommandHandler> logger)
    : ICommandHandler<ResumeSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        ResumeSubscriptionCommand request,
        CancellationToken cancellationToken)
    {
        var sub = await db.Subscriptions
            .Where(s => s.Id == request.SubscriptionId && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription", request.SubscriptionId);

        if (sub.Status != SubscriptionStatus.Paused)
            return Error.Validation("Subscription.CannotResume",
                $"Only Paused subscriptions can be resumed. Current status: {sub.Status}.");

        sub.Resume();
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Subscription {SubscriptionId} resumed for org {OrgId}.",
            sub.Id, sub.OrganizationId);

        return Result.Success();
    }
}
