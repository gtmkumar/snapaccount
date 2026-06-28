using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Application.Subscriptions.Queries.ListSubscriptionEvents;

/// <summary>
/// DG-SUB-10: Returns a recent-events feed of subscription lifecycle transitions.
/// Used by the admin subscriptions dashboard events table.
/// Derives events from subscription status changes and invoice payments without requiring
/// a dedicated event-log table. Platform-admin only.
/// </summary>
[RequiresPermission("subscription.plan.create")]
public record ListSubscriptionEventsQuery(int Limit = 20) : IQuery<IReadOnlyList<SubscriptionEventDto>>;

/// <summary>
/// A single subscription lifecycle event row.
/// JSON casing matches the frontend <c>SubscriptionEventSchema</c> in subscriptionApi.ts:
/// <c>{ eventId, eventType, organizationId, organizationName?, planName?, mrr?, occurredAt }</c>.
/// </summary>
public record SubscriptionEventDto(
    /// <summary>Stable synthetic event identifier (not a DB primary key — derived from subscription/invoice id + event type).</summary>
    string EventId,
    /// <summary>
    /// Event type string. Values: <c>Subscribed</c>, <c>Upgraded</c>, <c>Downgraded</c>,
    /// <c>Cancelled</c>, <c>PastDue</c>, <c>Paused</c>, <c>Resumed</c>, <c>Paid</c>, <c>Refunded</c>, <c>Voided</c>.
    /// </summary>
    string EventType,
    /// <summary>Organisation UUID as string.</summary>
    string OrganizationId,
    /// <summary>Organisation display name resolved from auth.organizations (nullable when org not found).</summary>
    string? OrganizationName,
    /// <summary>Plan name at time of event (nullable for payment/invoice events).</summary>
    string? PlanName,
    /// <summary>Monthly MRR contribution of this subscription at the time of the event.</summary>
    decimal? Mrr,
    /// <summary>UTC ISO 8601 timestamp of the event.</summary>
    string OccurredAt);

/// <summary>Validates <see cref="ListSubscriptionEventsQuery"/>.</summary>
public sealed class ListSubscriptionEventsQueryValidator : AbstractValidator<ListSubscriptionEventsQuery>
{
    /// <summary>Initialises validation rules.</summary>
    public ListSubscriptionEventsQueryValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, 100)
            .WithMessage("Limit must be between 1 and 100.");
    }
}

/// <summary>Handles <see cref="ListSubscriptionEventsQuery"/>.</summary>
public sealed class ListSubscriptionEventsQueryHandler(
    ISubscriptionServiceDbContext db,
    IAuthDbContext authDb)
    : IQueryHandler<ListSubscriptionEventsQuery, IReadOnlyList<SubscriptionEventDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<SubscriptionEventDto>>> Handle(
        ListSubscriptionEventsQuery request,
        CancellationToken cancellationToken)
    {
        // ── Subscription lifecycle events ─────────────────────────────────────
        // Derive events from subscription state columns:
        //   CreatedAt           → Subscribed (or Trialing if initial status = Trialing)
        //   CancelledAt != null → Cancelled
        //   Status = PastDue    → PastDue (use UpdatedAt as approximation)
        //   Status = Paused     → Paused
        //   Status = Active & AnonymizedAt == null & CancelledAt == null → Resumed / re-activated

        // Load via anonymous projection; compute MonthlyMrr client-side to avoid EF cast issues.
        var rawSubs = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.DeletedAt == null)
            .Select(s => new
            {
                s.Id,
                s.OrganizationId,
                s.Status,
                PlanName = s.Plan.Name,
                PlanPriceInr = s.Plan.PriceInr,
                PlanBillingCycle = (int)s.Plan.BillingCycle,
                s.CreatedAt,
                s.CancelledAt,
                s.UpdatedAt
            })
            .ToListAsync(cancellationToken);

        var subProjections = rawSubs.Select(s => new SubProjection(
            s.Id,
            s.OrganizationId,
            s.Status,
            s.PlanName,
            s.PlanBillingCycle > 0 ? s.PlanPriceInr / s.PlanBillingCycle : s.PlanPriceInr,
            s.CreatedAt,
            s.CancelledAt,
            s.UpdatedAt)).ToList();

        // ── Invoice events ────────────────────────────────────────────────────
        // Paid / Refunded / Voided invoice rows carry their own timestamps.
        var invoiceProjections = await db.Invoices
            .Where(i => i.DeletedAt == null
                        && (i.Status == "PAID" || i.Status == "REFUNDED" || i.Status == "VOID"))
            .Select(i => new InvoiceProjection(
                i.Id,
                i.OrganizationId,
                i.Status,
                i.AmountInr,
                i.PaidAt,
                i.RefundedAt,
                i.VoidedAt))
            .ToListAsync(cancellationToken);

        // ── Build synthetic events ────────────────────────────────────────────
        var rawEvents = new List<(string EventId, string EventType, Guid OrgId, string? PlanName, decimal? Mrr, DateTime OccurredAt)>();

        foreach (var s in subProjections)
        {
            // Subscription created → Subscribed (or Trialing)
            string createdType = s.Status == SubscriptionStatus.Trialing ? "Trialing" : "Subscribed";
            rawEvents.Add(($"{s.Id}:created", createdType, s.OrganizationId, s.PlanName, s.MonthlyMrr, s.CreatedAt));

            // Cancellation
            if (s.CancelledAt.HasValue)
                rawEvents.Add(($"{s.Id}:cancelled", "Cancelled", s.OrganizationId, s.PlanName, null, s.CancelledAt.Value));

            // Past-due (use UpdatedAt as approximation; only for current PastDue status)
            if (s.Status == SubscriptionStatus.PastDue)
                rawEvents.Add(($"{s.Id}:pastdue", "PastDue", s.OrganizationId, s.PlanName, s.MonthlyMrr, s.UpdatedAt));

            // Paused
            if (s.Status == SubscriptionStatus.Paused)
                rawEvents.Add(($"{s.Id}:paused", "Paused", s.OrganizationId, s.PlanName, null, s.UpdatedAt));
        }

        foreach (var inv in invoiceProjections)
        {
            if (inv.Status == "PAID" && inv.PaidAt.HasValue)
                rawEvents.Add(($"{inv.Id}:paid", "Paid", inv.OrganizationId, null, inv.AmountInr, inv.PaidAt.Value));
            else if (inv.Status == "REFUNDED" && inv.RefundedAt.HasValue)
                rawEvents.Add(($"{inv.Id}:refunded", "Refunded", inv.OrganizationId, null, inv.AmountInr, inv.RefundedAt.Value));
            else if (inv.Status == "VOID" && inv.VoidedAt.HasValue)
                rawEvents.Add(($"{inv.Id}:voided", "Voided", inv.OrganizationId, null, null, inv.VoidedAt.Value));
        }

        // Take the N most recent events.
        var topEvents = rawEvents
            .OrderByDescending(e => e.OccurredAt)
            .Take(request.Limit)
            .ToList();

        // ── Batch-resolve org names ───────────────────────────────────────────
        var orgIds = topEvents.Select(e => e.OrgId).Distinct().ToList();

        var orgLookup = await authDb.Organizations
            .Where(o => orgIds.Contains(o.Id) && o.DeletedAt == null)
            .Select(o => new { o.Id, o.BusinessName })
            .ToDictionaryAsync(o => o.Id, cancellationToken);

        // ── Map to DTO ────────────────────────────────────────────────────────
        var dtos = topEvents.Select(e =>
        {
            orgLookup.TryGetValue(e.OrgId, out var org);
            return new SubscriptionEventDto(
                EventId:          e.EventId,
                EventType:        e.EventType,
                OrganizationId:   e.OrgId.ToString(),
                OrganizationName: org?.BusinessName,
                PlanName:         e.PlanName,
                Mrr:              e.Mrr,
                OccurredAt:       e.OccurredAt.ToString("O"));
        }).ToList();

        return Result<IReadOnlyList<SubscriptionEventDto>>.Success(dtos);
    }
}

// ── Internal projection records ────────────────────────────────────────────────

internal record SubProjection(
    Guid Id,
    Guid OrganizationId,
    SubscriptionStatus Status,
    string PlanName,
    decimal MonthlyMrr,
    DateTime CreatedAt,
    DateTime? CancelledAt,
    DateTime UpdatedAt);

internal record InvoiceProjection(
    Guid Id,
    Guid OrganizationId,
    string Status,
    decimal AmountInr,
    DateTime? PaidAt,
    DateTime? RefundedAt,
    DateTime? VoidedAt);
