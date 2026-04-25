using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Commands.CancelSubscription;

/// <summary>Cancels the active subscription for the caller's organisation.</summary>
public record CancelSubscriptionCommand(Guid SubscriptionId) : ICommand<Result>;

/// <summary>Validates CancelSubscriptionCommand.</summary>
public sealed class CancelSubscriptionCommandValidator : AbstractValidator<CancelSubscriptionCommand>
{
    public CancelSubscriptionCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
    }
}

/// <summary>Handler: cancels subscription with IDOR org-scoping.</summary>
public sealed class CancelSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CancelSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        CancelSubscriptionCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var sub = await db.Subscriptions
            .Where(s => s.Id == request.SubscriptionId && s.OrganizationId == orgId && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription", request.SubscriptionId);

        sub.Cancel();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
