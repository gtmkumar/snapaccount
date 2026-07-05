namespace SubscriptionService.Domain.Enums;

/// <summary>Billing frequency for a subscription plan.</summary>
public enum BillingCycle
{
    /// <summary>Billed monthly.</summary>
    Monthly = 1,

    /// <summary>Billed quarterly.</summary>
    Quarterly = 3,

    /// <summary>Billed annually.</summary>
    Annual = 12
}
