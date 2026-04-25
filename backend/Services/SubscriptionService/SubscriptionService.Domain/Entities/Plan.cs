using SnapAccount.Shared.Domain;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Domain.Entities;

/// <summary>
/// A subscription plan available for organisations to subscribe to.
/// Admin-managed; tier and pricing are configurable.
/// </summary>
public class Plan : BaseAuditableEntity
{
    /// <summary>Plan display name (e.g. "Starter Monthly").</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>Feature tier for gate enforcement.</summary>
    public PlanTier Tier { get; private set; }

    /// <summary>Billing frequency.</summary>
    public BillingCycle BillingCycle { get; private set; }

    /// <summary>Price in INR (paise — multiply by 100 for Razorpay).</summary>
    public decimal PriceInr { get; private set; }

    /// <summary>Trial period in days (0 = no trial).</summary>
    public int TrialDays { get; private set; }

    /// <summary>Whether this plan is currently offered to new subscribers.</summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>Optional description / feature list (markdown).</summary>
    public string? Description { get; private set; }

    private Plan() { }

    /// <summary>Creates a new plan.</summary>
    public static Plan Create(
        string name,
        PlanTier tier,
        BillingCycle billingCycle,
        decimal priceInr,
        int trialDays = 0,
        string? description = null)
        => new()
        {
            Name = name,
            Tier = tier,
            BillingCycle = billingCycle,
            PriceInr = priceInr,
            TrialDays = trialDays,
            Description = description,
            IsActive = true
        };

    /// <summary>Updates mutable plan fields (admin operation).</summary>
    public void Update(string name, decimal priceInr, string? description, bool isActive)
    {
        Name = name;
        PriceInr = priceInr;
        Description = description;
        IsActive = isActive;
    }
}
