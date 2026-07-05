namespace SubscriptionService.Domain.Enums;

/// <summary>
/// State machine for a subscription.
/// Valid transitions:
///   TRIALING → ACTIVE (after trial)
///   ACTIVE → PAST_DUE (payment fails)
///   PAST_DUE → ACTIVE (payment succeeds)
///   ACTIVE | PAST_DUE → CANCELLED
///   ACTIVE → PAUSED
///   PAUSED → ACTIVE
/// </summary>
public enum SubscriptionStatus
{
    /// <summary>Free trial period is active.</summary>
    Trialing = 1,

    /// <summary>Subscription is active and paid.</summary>
    Active = 2,

    /// <summary>Payment is overdue; grace period active.</summary>
    PastDue = 3,

    /// <summary>Subscription has been cancelled.</summary>
    Cancelled = 4,

    /// <summary>Subscription is paused by the user.</summary>
    Paused = 5
}
