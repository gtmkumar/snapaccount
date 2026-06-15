namespace SubscriptionService.Domain.Enums;

/// <summary>
/// Tier level of a subscription plan.
/// Controls feature gating.
/// </summary>
public enum PlanTier
{
    /// <summary>Free tier — limited features.</summary>
    Free = 0,

    /// <summary>Starter tier — basic accounting and GST.</summary>
    Starter = 1,

    /// <summary>Growth tier — all services + CA collaboration.</summary>
    Growth = 2,

    /// <summary>Enterprise tier — unlimited + dedicated CA support.</summary>
    Enterprise = 3
}
