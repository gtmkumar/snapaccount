using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
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
    DateTime CurrentPeriodEnd,
    string? RazorpaySubscriptionId = null,
    string? RazorpayShortUrl = null);

/// <summary>Validates SubscribeCommand.</summary>
public sealed class SubscribeCommandValidator : AbstractValidator<SubscribeCommand>
{
    public SubscribeCommandValidator()
    {
        RuleFor(x => x.PlanId).NotEmpty();
        RuleFor(x => x.RazorpaySubscriptionId).MaximumLength(100).When(x => x.RazorpaySubscriptionId != null);
    }
}

/// <summary>
/// Handler: creates a subscription, cancels any existing active one,
/// and initiates a Razorpay subscription when integration is enabled (DG-SUB-02).
/// </summary>
public sealed class SubscribeCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser,
    IRazorpayClient razorpay,
    ILogger<SubscribeCommandHandler> logger) : ICommandHandler<SubscribeCommand, SubscribeResponse>
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

        // DG-SUB-02: If a client-supplied RazorpaySubscriptionId is provided (webhook-first flow),
        // use it directly. Otherwise, for paid plans with a Razorpay plan ID, create a subscription
        // via the Razorpay API.
        string? razorpaySubId   = request.RazorpaySubscriptionId;
        string? razorpayShortUrl = null;

        if (razorpaySubId is null && plan.PriceInr > 0 && plan.RazorpayPlanId is not null)
        {
            try
            {
                // Billing cycle total_count: 0 = unlimited recurring.
                var subResult = await razorpay.CreateSubscriptionAsync(
                    plan.RazorpayPlanId,
                    totalCount: 0,
                    notes: new Dictionary<string, string>
                    {
                        ["org_id"]       = orgId.Value.ToString(),
                        ["plan_id"]      = plan.Id.ToString(),
                        ["plan_name"]    = plan.Name,
                    },
                    cancellationToken);

                razorpaySubId    = subResult.SubscriptionId;
                razorpayShortUrl = subResult.ShortUrl;

                logger.LogInformation(
                    "Razorpay subscription {RazorpaySubId} created for org {OrgId} on plan {PlanId}",
                    razorpaySubId, orgId.Value, plan.Id);
            }
            catch (Exception ex)
            {
                // Non-fatal: subscription is created locally; Razorpay sync can be retried.
                // The webhook-first flow (Razorpay → webhook → Activate) remains the authoritative path.
                logger.LogWarning(ex,
                    "Failed to create Razorpay subscription for org {OrgId} plan {PlanId} — " +
                    "subscription saved locally without Razorpay ID.",
                    orgId.Value, plan.Id);
            }
        }

        var subscription = Subscription.Create(
            orgId.Value,
            plan.Id,
            plan.TrialDays,
            razorpaySubId,
            request.RazorpayCustomerId,
            // BUG-SUB-SUBSCRIBE-WRITE: user_id is NOT NULL — record the purchasing user.
            userId: currentUser.UserId);

        db.Subscriptions.Add(subscription);
        await db.SaveChangesAsync(cancellationToken);

        return new SubscribeResponse(
            subscription.Id,
            subscription.Status.ToString(),
            subscription.CurrentPeriodEnd,
            subscription.RazorpaySubscriptionId,
            razorpayShortUrl);
    }
}
