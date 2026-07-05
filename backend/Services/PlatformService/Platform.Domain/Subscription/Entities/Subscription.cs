using SnapAccount.Shared.Domain;
using SubscriptionService.Domain.Enums;
using SubscriptionService.Domain.Events;

namespace SubscriptionService.Domain.Entities;

/// <summary>
/// An organisation's subscription to a plan.
/// State machine: TRIALING → ACTIVE → PAST_DUE → CANCELLED | PAUSED.
/// </summary>
public class Subscription : BaseAuditableEntity
{
    /// <summary>Organisation that holds this subscription.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>
    /// User who purchased the subscription. subscription.subscription.user_id is NOT NULL
    /// (migration 010) — BUG-SUB-SUBSCRIBE-WRITE: was never on the entity, so every subscribe 500'd.
    /// </summary>
    public Guid UserId { get; private set; }

    /// <summary>Subscribed plan.</summary>
    public Guid PlanId { get; private set; }

    /// <summary>Current status.</summary>
    public SubscriptionStatus Status { get; private set; }

    /// <summary>Start of current billing period.</summary>
    public DateTime CurrentPeriodStart { get; private set; }

    /// <summary>End of current billing period.</summary>
    public DateTime CurrentPeriodEnd { get; private set; }

    /// <summary>Razorpay subscription ID (for webhook correlation).</summary>
    public string? RazorpaySubscriptionId { get; private set; }

    /// <summary>Razorpay customer ID.</summary>
    public string? RazorpayCustomerId { get; private set; }

    /// <summary>When the subscription was cancelled (if applicable).</summary>
    public DateTime? CancelledAt { get; private set; }

    /// <summary>Navigation to invoices.</summary>
    public IReadOnlyList<Invoice> Invoices => _invoices.AsReadOnly();
    private readonly List<Invoice> _invoices = [];

    /// <summary>Navigation to plan.</summary>
    public Plan Plan { get; private set; } = null!;

    private Subscription() { }

    /// <summary>Creates a new subscription (starts as TRIALING if trial days > 0, else ACTIVE).</summary>
    /// <remarks>
    /// BUG-SUB-SUBSCRIBE-WRITE: <paramref name="userId"/> is trailing-optional to preserve the
    /// existing call sites; the SubscribeCommandHandler always supplies the purchasing user's id
    /// (the DB column user_id is NOT NULL).
    /// </remarks>
    public static Subscription Create(
        Guid organizationId,
        Guid planId,
        int trialDays,
        string? razorpaySubscriptionId = null,
        string? razorpayCustomerId = null,
        Guid userId = default)
    {
        var now = DateTime.UtcNow;
        var status = trialDays > 0 ? SubscriptionStatus.Trialing : SubscriptionStatus.Active;

        var sub = new Subscription
        {
            OrganizationId = organizationId,
            UserId = userId,
            PlanId = planId,
            Status = status,
            CurrentPeriodStart = now,
            CurrentPeriodEnd = now.AddDays(trialDays > 0 ? trialDays : 30),
            RazorpaySubscriptionId = razorpaySubscriptionId,
            RazorpayCustomerId = razorpayCustomerId
        };

        sub.AddDomainEvent(new SubscriptionCreatedEvent(sub.Id, organizationId, planId, status));
        return sub;
    }

    /// <summary>Activates the subscription after successful payment / trial end.</summary>
    public void Activate(DateTime periodEnd)
    {
        Status = SubscriptionStatus.Active;
        CurrentPeriodStart = DateTime.UtcNow;
        CurrentPeriodEnd = periodEnd;
    }

    /// <summary>Marks subscription as past due (payment failed).</summary>
    public void MarkPastDue() => Status = SubscriptionStatus.PastDue;

    /// <summary>Cancels the subscription.</summary>
    public void Cancel()
    {
        Status = SubscriptionStatus.Cancelled;
        CancelledAt = DateTime.UtcNow;
        AddDomainEvent(new SubscriptionCancelledEvent(Id, OrganizationId));
    }

    /// <summary>Pauses the subscription.</summary>
    public void Pause() => Status = SubscriptionStatus.Paused;

    /// <summary>Resumes a paused subscription.</summary>
    public void Resume() => Status = SubscriptionStatus.Active;

    /// <summary>Changes the plan (upgrade or downgrade).</summary>
    public void ChangePlan(Guid newPlanId)
    {
        PlanId = newPlanId;
        AddDomainEvent(new SubscriptionPlanChangedEvent(Id, OrganizationId, newPlanId));
    }

    /// <summary>Renews the period after successful payment.</summary>
    public void Renew(DateTime newPeriodEnd)
    {
        Status = SubscriptionStatus.Active;
        CurrentPeriodStart = DateTime.UtcNow;
        CurrentPeriodEnd = newPeriodEnd;
    }

    /// <summary>Records a Razorpay subscription ID (set after webhook confirmation).</summary>
    public void SetRazorpaySubscriptionId(string razorpaySubscriptionId)
        => RazorpaySubscriptionId = razorpaySubscriptionId;

    // ── DPDP Act 2023 ─────────────────────────────────────────────────────────

    /// <summary>DPDP: timestamp of user-id anonymization.</summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>DPDP: reason for anonymization.</summary>
    public string? AnonymizationReason { get; private set; }

    /// <summary>
    /// DPDP Act 2023 (SEC-052): anonymize on user erasure.
    /// Sets OrganizationId to Guid.Empty and records reason.
    /// Does NOT hard-delete (RBI compliance retention: 7 years).
    /// </summary>
    public void Anonymize(string reason = "DPDP_USER_ERASURE")
    {
        OrganizationId = Guid.Empty;
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
