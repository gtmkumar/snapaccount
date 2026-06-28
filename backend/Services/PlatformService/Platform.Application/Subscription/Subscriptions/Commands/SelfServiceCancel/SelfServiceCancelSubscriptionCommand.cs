using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Commands.SelfServiceCancel;

/// <summary>
/// DG-SUB-04: Self-service cancel — caller's subscription resolved server-side from
/// <see cref="ICurrentUser.OrganizationId"/>. No subscription id in the route.
/// Maps to DELETE /subscriptions/me.
/// </summary>
public record SelfServiceCancelSubscriptionCommand : ICommand<Result>;

/// <summary>
/// Resolves the active subscription for the caller's organisation and cancels it.
/// Returns 404 when the organisation has no active subscription.
/// </summary>
public sealed class SelfServiceCancelSubscriptionCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<SelfServiceCancelSubscriptionCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        SelfServiceCancelSubscriptionCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var sub = await db.Subscriptions
            .Where(s => s.OrganizationId == orgId
                        && s.DeletedAt == null
                        && s.Status != SubscriptionStatus.Cancelled)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub is null)
            return Error.NotFound("Subscription.NotFound", "This organisation has no active subscription to cancel.");

        sub.Cancel();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
